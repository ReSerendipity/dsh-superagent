# POSIX 服务启动器：真机验证清单

> **状态：待执行清单，不是验证结果。** 本文件列出的每一项都尚未在真机上跑过。
> 全部通过并把结果填进 §5 的记录表后，`docs/028-platform-support.md` 的 P1-5 才可关闭。
>
> 为什么需要真机：`scripts/dsh-superagent` 的 POSIX 分支在 CI 里有契约测试（`tests/service-script.spec.ts`，用**假 `ps` / 假 `tmux`**，但**真 `fcntl.flock`、真 `os.kill(SIGINT)`、真文件锁**），而真实 `tmux` 命令交互、真实 `ps -ax` 输出解析、真实 `dsh` 进程的启动与退出码**只能在真机跑**：
>
> - 开发机是 Windows，**没有 WSL 发行版**（`wsl -l -v` 为空）；
> - GitHub `ubuntu-24.04` 官方镜像**不含 tmux**（Python 3.12 有），为一条低频路径给每次 CI 加 `apt-get install tmux` 不划算。
>
> 因此本清单由人在 Linux 或 macOS 上执行一次。两个平台都做，或至少做与目标用户一致的那一个。

---

## 1. 前置条件

| 依赖 | 要求 | 检查命令 |
| --- | --- | --- |
| Node.js | `^22.19.0 \|\| >=24` | `node -v` |
| Python | 3.8+，命令名 `python3` | `python3 --version` |
| git | 2.32+ | `git --version` |
| DSH CLI | 在 `PATH` 上，能跑 `dsh --version` | `dsh --version` |
| tmux | Linux：`sudo apt-get install -y tmux`；macOS：`brew install tmux` | `tmux -V` |
| DSH profile | 已装 dsh-superagent 插件（`dsh plugin list` 能看到 `@reserendipity/dsh-superagent`） | `dsh plugin list` |
| 模型 provider | profile 至少配好一个可用模型，否则服务起得来但工单跑不了 | 面板或 `dsh` 配置 |

**不要**在别人的生产 profile 上做这套验证。用一个独立 profile，例如 `--profile posix-verify`，并给它单独的 `stateDir`。

---

## 2. 通用清单（Linux 与 macOS 都执行）

以下命令都在仓库 checkout 根目录执行。`$P` 代表验证用的 profile 名，`$STATE` 代表该 profile 的 `stateDir`。

```sh
P=posix-verify
export DSH_SUPERAGENT_PROFILE=$P
```

### L1 · 帮助与参数

```sh
python3 scripts/dsh-superagent --help
```

- 期望：退出码 `0`；usage 里出现 `start` / `stop` / `restart` / `status`，以及 `--profile`、`--url`、`--timeout`、`--stop-timeout`、`--respect-stop`。
- 失败排查：`python3` 不在 PATH、脚本可执行位丢失（`git ls-files -s scripts/dsh-superagent` 应为 `100755`）。

### L2 · `start` 起服务

```sh
python3 scripts/dsh-superagent start --profile $P
echo "exit=$?"
```

- 期望：退出码 `0`；`tmux has-session -t =dsh-$P` 成功；日志出现在 `.artifacts/dsh-superagent-$P-<YYYYMMDD-HHMMSS>-<pid>.log`。
- 记录：`tmux list-panes -t =dsh-$P -F '#{pane_pid}'` 的 pid，应等于服务进程 pid（启动器用 `exec` 替换 shell，pane pid 就是 DSH 服务本身）。
- 失败排查：`Both dsh and tmux must be on PATH.` → 依赖缺失；`already running` → 先 `stop`；端口被占 → 改 profile 的 `webserver.port` 或加 `--patch` overlay。

### L3 · `status` 的四个退出码

| 场景 | 构造方式 | 期望退出码 |
| --- | --- | --- |
| 健康 | 服务正常跑 | `0` |
| 未运行 | `stop` 后再 `status` | `1` |
| 有部件报错 | 让某个 Source 报错（如 GitHub Source 配一个不可读仓库），重启后 `status` | `2` |
| 等待 setup | 不配 `repository`（GitHub 模式）或留空准入名单，重启后 `status` | `3` |

```sh
python3 scripts/dsh-superagent status --profile $P; echo "exit=$?"
```

- 期望：上表四码都能实际触发一次，且 `status` 打印的错误摘要与面板一致。
- 失败排查：`--url` 与 profile 实际端口不一致（profile 的 `webserver.port` 会覆盖 CLI 的应用参数）。

### L4 · `stop` 的优雅停止

```sh
python3 scripts/dsh-superagent stop --profile $P; echo "exit=$?"
```

- 期望：退出码 `0`，耗时远小于 `--stop-timeout`（默认 300s）；服务进程收到 `SIGINT` 并正常退出；**没有任何强杀**（`kill -9` / `taskkill`）。
- 期望：`.artifacts/control/profiles/$P/manually-stopped` 被写入。
- 超时场景：让一个 Executor 卡在长步骤里，`stop` 应在 `--stop-timeout` 后**报错退出**而不是强杀。
- 失败排查：进程还在但 `stop` 说没找到 → 检查 `ps` 解析（见 L7）。

### L5 · `restart` 与 `--respect-stop`

```sh
python3 scripts/dsh-superagent restart --profile $P; echo "exit=$?"
python3 scripts/dsh-superagent start --profile $P --respect-stop; echo "exit=$?"
```

- 期望：`restart` = 先 `stop` 再 `start`，pid 变化；`restart` **不写** `manually-stopped`。
- 期望：`stop` 后带 `--respect-stop` 的 `start` 退出 `0` 并打印 `Intentional stop is active; automatic recovery skipped.`，不真正启动。
- 期望：普通 `start` 会清除 `manually-stopped` 标记。

### L6 · 单实例锁（`fcntl.flock`）

```sh
python3 scripts/dsh-superagent start --profile $P
python3 scripts/dsh-superagent start --profile $P; echo "exit=$?"
```

- 期望：第二次 `start` 被拒（`already running (PID …); no duplicate started.`），不产生第二个 tmux 窗口。
- 期望：同一 `stateDir` 上再起一个后端，DSH 侧报 `Lock file is already being held`（这是 `stateDir` 锁，与启动器锁是两层）。
- 失败排查：两个 profile 共用 `stateDir` → 必须分开。

### L7 · `ps` 输出解析（**平台差异最大**）

```sh
ps -ax -o pid=,comm=,args= | head -5
python3 scripts/dsh-superagent status --profile $P; echo "exit=$?"
```

- 期望：Linux（GNU `ps`）与 macOS（BSD `ps`）都能正确识别出 `node` / `dsh` 进程及其 `--profile $P` 参数；`status` 能找到唯一 pid。
- 同名 profile 多进程：手工再起一个带 `--profile $P` 的 `dsh`（不经过启动器），再跑 `status` / `stop`。
- 期望：启动器**拒绝**操作（不误杀任意一个），退出码 `1`，并提示有多个进程。
- 失败排查：BSD `ps` 的 `comm` 列可能是截断的路径；若解析不到，记录 `ps -ax` 的原始输出，这属于真实缺陷，需开 issue。

### L8 · 日志裁剪

```sh
ls -1 .artifacts/dsh-superagent-$P-*.log | wc -l
```

- 期望：反复 `restart` 超过 20 次后，日志文件数稳定在 **20**（`KEEP_LOGS = 20`），保留的是最新 20 份。
- 失败排查：`prune_logs` 按 `st_mtime` 排序；若文件系统时间精度导致顺序抖动，记录实际保留集合。

### L9 · 与其它 tmux 会话互不干扰

```sh
tmux new-session -d -s unrelated 'sleep 300'
python3 scripts/dsh-superagent start --profile $P
python3 scripts/dsh-superagent stop --profile $P
tmux has-session -t =unrelated; echo "unrelated_alive=$?"
tmux kill-session -t =unrelated
```

- 期望：`unrelated` 会话在整个过程中存活（`unrelated_alive=0`）；启动器复用已有 `dsh-$P` 会话时用 `new-window`，不破坏同会话的其它窗口。

### L10 · 面板与健康接口

```sh
curl -s -o /dev/null -w '%{http_code}\n' "http://127.0.0.1:<port>/"
curl -s -H 'x-orchestrator-request: 1' "http://127.0.0.1:<port>/orchestrator/api/state" | head -c 400
```

- 期望：裸 URL 返回 `401`（设计如此，不要用 `/` 判断存活）；带 `x-orchestrator-request: 1` 的管理接口返回 `200` 且 `runtime` 状态可读。

---

## 3. Linux 专属补充

1. `tmux` 用发行版包安装，确认版本：`tmux -V`（记录版本号）。
2. GNU `ps` 的 `-o pid=,comm=,args=` 输出与 BSD 不同，重点确认 `comm` 是短名（`node` / `dsh`）而非完整路径。
3. 若用 systemd 托管，额外记录：`systemctl --user status` 下的进程树与启动器自己记的 pid 是否一致（启动器不注册 systemd，这是可选做法）。
4. 无 GUI 环境：`start` 必须带 `--no-open`（启动器默认就带），确认没有尝试拉起浏览器。

## 4. macOS 专属补充

1. `tmux` 用 Homebrew 安装（macOS 不自带）：`brew install tmux`，记录 `tmux -V`。
2. BSD `ps` 的参数与输出：确认 `ps -ax` 可用，`-o pid=,comm=,args=` 的 `comm` 可能被截断到 16 字符——这是 L7 的重点。
3. Gatekeeper：首次运行从网络下载的 `dsh` / `gh` 二进制可能被拦（`killed: 9` 或“无法验证开发者”）。记录是否需要 `xattr -d com.apple.quarantine`，**不要**建议全局关闭 Gatekeeper。
4. Keychain：若 `gh` 用 Keychain 存凭据，确认 worker 会话（注入 `GH_CONFIG_DIR`）读到的是智能体账号而不是操作者账号。
5. 面板的 `[data-platform='darwin']` 顶部安全区：在 DSH 桌面端打开面板，确认标题栏不被刘海/交通灯遮挡（截图留证）。
6. 文件系统大小写：默认 APFS 大小写不敏感，确认 `stateDir` 路径大小写混用时 `sameDirectory()` / `realpath` 仍能正确判定（构造一个大小写不同的同一路径）。

---

## 5. 结果记录表

复制一张表，每个平台填一张。**只有全部为 PASS 才能关闭 P1-5**；任何 FAIL 都要开 issue 并在 `docs/028` 的开放项里登记。

### Linux（发行版 / 内核：__________，tmux：__________）

| 项 | 结果 | 证据（命令输出 / 日志路径 / 截图） | 日期 | 执行人 |
| --- | --- | --- | --- | --- |
| L1 帮助与参数 |  |  |  |  |
| L2 start |  |  |  |  |
| L3 status 四码 |  |  |  |  |
| L4 stop 优雅停止 |  |  |  |  |
| L5 restart / respect-stop |  |  |  |  |
| L6 单实例锁 |  |  |  |  |
| L7 ps 解析 |  |  |  |  |
| L8 日志裁剪 20 |  |  |  |  |
| L9 tmux 会话隔离 |  |  |  |  |
| L10 面板与健康接口 |  |  |  |  |

### macOS（版本：__________，tmux：__________，芯片：__________）

| 项 | 结果 | 证据 | 日期 | 执行人 |
| --- | --- | --- | --- | --- |
| L1 帮助与参数 |  |  |  |  |
| L2 start |  |  |  |  |
| L3 status 四码 |  |  |  |  |
| L4 stop 优雅停止 |  |  |  |  |
| L5 restart / respect-stop |  |  |  |  |
| L6 单实例锁 |  |  |  |  |
| L7 ps 解析（BSD） |  |  |  |  |
| L8 日志裁剪 20 |  |  |  |  |
| L9 tmux 会话隔离 |  |  |  |  |
| L10 面板与健康接口 |  |  |  |  |
| M1 Gatekeeper |  |  |  |  |
| M2 Keychain 账号隔离 |  |  |  |  |
| M3 darwin 安全区 |  |  |  |  |
| M4 APFS 大小写 |  |  |  |  |

---

## 6. 关闭条件

1. 目标平台的结果表全部 PASS，证据可复核（命令输出或日志，不接受“试过了”）。
2. 在 `docs/028-platform-support.md` 的 §4.2 里把对应条目改为「已按 `docs/029` 验证（日期 / 平台 / 版本）」，并把 `docs/028` 的 §2 矩阵中对应平台的 E2E / 真机列更新为已验证。
3. macOS 即使全部 PASS，也只把**真机层**从“静态推断”改为“已验证”；是否升 Tier 2 仍需按 `docs/028` §1 的 Tier 判据单独评估（Tier 2 还要求 CI 全绿 + 单元/契约测试，本仓已满足；端到端首单属于 Tier 1 判据）。
4. 任何 FAIL：开 issue 记录复现步骤与 `ps` / `tmux` 原始输出，不要在本文件里写“大概”“应该是”。
