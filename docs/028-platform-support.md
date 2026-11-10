# 平台支持矩阵与差异台账

> 状态：**P0 在研（rev2，2026-11-10）**。本仓是独立维护的跨平台发行版，Windows / macOS / Linux 均为目标平台；
> Windows 是已验证的 Tier 1 回归基线，macOS / Linux 尚未完成端到端验证，**对外仍按「适配进行中」表述**。
> CI 通道：三平台 matrix（`ubuntu-latest` / `macos-latest` / `windows-latest`）保留；公开仓的标准 GitHub-hosted
> runner 免费，不因 macOS 计费删除该平台。macOS 采用双层口径：GitHub `macos-latest` 只验证测试层
> （`typecheck` / `build` / `vitest` / `lib` 一致性），Mac 真机层只做代码静态审查，二者不混为一谈。
> 本文档记录支持等级、平台差异与证据索引；它不替代各平台的验收记录。

## 1. 支持等级定义

| 等级 | 含义 | 判据 |
| --- | --- | --- |
| **Tier 1** 正式支持 | 可作为正式目标平台 | 三平台 CI 全绿 + Mode A / Mode B 端到端首单通过 + 有安装文档 + 发布门禁可在本平台执行 |
| **Tier 2** 在研支持 | 可安装、可回归，端到端未验 | CI 全绿 + 单元 / 契约测试通过；端到端尚未跑通，文档标注限制 |
| **Tier 3** 仅可安装 | 无平台门槛，但无验证 | bundle 没有 `os` / `cpu` 门槛；无该平台 CI、无验证、无专属文档 |

P0 的出口判据：Linux 在 CI 首次全绿后升 **Tier 2**；macOS 即使 CI 全绿也只证明测试层，真机层没有验证条件，
**保持 Tier 3**，不写成 Tier 2 / supported。Tier 1 还需要 `docs/WINDOWS-SETUP.md` §12.1 那种端到端记录，
属于后续阶段。

## 2. 三平台支持矩阵

| 平台 | 安装 | CI | 测试 | E2E | 文档 | 当前等级 |
| --- | --- | --- | --- | --- | --- | --- |
| **Windows** | Tier 1：官方应用内插件安装、包名 / GitHub / 本地目录三种方式均验证 | Tier 1：`windows-latest` 在 CI matrix 中 | Tier 1：本机全量实测 `1282 passed / 49 skipped`（6f429c3，含 1 条 Windows 侧跳过的 POSIX 对等用例），Windows 契约测试全绿 | Tier 1：`WINDOWS-SETUP.md` §12.1 的 Mode A / Mode B 实跑记录 | Tier 1：`WINDOWS-SETUP.md`、`WINDOWS-DELTA.md` | **Tier 1** |
| **macOS** | Tier 3：bundle 无平台门槛，未实测安装 | `macos-latest` 在 matrix 中；run 42835530222 仍 1 红（`config-watch` 邻居误触发），待下次 CI 验证（标准 runner 对公开仓免费） | POSIX-only 用例已在 CI 中；macOS 侧仅 `config-watch` 的邻居误触发仍红，其余通过 | 无 Mac 真机条件，未执行 | 本文档静态审查 + 上游 POSIX 手册 | **Tier 3**（CI 全绿仅证明测试层，不足以升 Tier 2） |
| **Linux** | Tier 3：bundle 无平台门槛，未实测安装 | `ubuntu-latest` 在 matrix 中；run 42835530222 首次全绿 | Tier 3 → 目标 Tier 2：POSIX-only 用例已在 CI 全绿（run 42835530222） | Tier 3：尚未执行 | Tier 3：本文档 + 上游 POSIX 文档，尚缺 Linux 专属安装说明 | **Tier 3**（首次 CI 已全绿；Tier 2 升级待派单方验收确认） |

「已加入 matrix」不等于「已通过」：CI 首次三平台全绿之前，macOS / Linux 仍按 Tier 3 记录。
「CI 全绿」也不等于「macOS 真机可用」：`macos-latest` 只跑 Node 测试层，不加载 Electron 桌面端，
不经过 Gatekeeper / Keychain，也不跑端到端首单，因此 macOS **不因 CI 全绿升 Tier 2**。
Linux 验收后可升 Tier 2；等级定义见 §1。

### 2.1 macOS 代码逻辑静态审查与验证边界

> 本节是**静态代码审查**，不是运行结果。审查对象是 P0 交付的代码；没有任何 Mac 真机运行证据。
> **GitHub `macos-latest` ≠ Mac 真机**：前者只能验证 Node 测试层，后者才涉及桌面端、Gatekeeper、Keychain 与端到端首单。

**门控形态**：全仓平台判断只有两种：TypeScript 的 `process.platform === 'win32'` 与 Python 启动器的
`os.name == 'nt'`。`darwin` 与 `linux` 都不满足这两个条件，因此**同走非 win32 的 POSIX 分支**，
代码路径等价；macOS 没有独立的 TypeScript / Python 平台分支。

| 文件 | 静态核对结果 |
| --- | --- |
| `src/infra/environment.ts` | `const windows = process.platform === 'win32'`；`writeEnvironment()` 在非 win32 写无扩展名 `#!/bin/sh` 垫片（`0o755`、`exec '<cli>' "$@"`、`:` 分隔 PATH 剥离）；`agentVariables()` 只在 win32 注入 `GH_CONFIG_DIR`；`runAsWorker()` 只在 win32 对 `.cmd` / `.bat` 走 `cmd.exe`；`written()` 用 `/\r?\n/` 切前两行并剥行首 `@REM`。 |
| `src/deployment.ts` | `absolute()` 正则 `^(?:[A-Za-z]:[\\/]|\/)` 接受 `/` 开头；`workerProbe()` 非 win32 走 `['env', 'PATH=…', …argv]`。 |
| `src/executor/dsh.ts` | prepare 命令非 win32 用 `['sh', '-c', command]`。 |
| `src/app/sessions.ts` | 工具名从实时工具注册表取；POSIX profile 通常是 `bash`，不硬编码 `pwsh` / `bash`。 |
| `scripts/dsh-superagent` | `WINDOWS = os.name == 'nt'`；非 nt 保留 `tmux`、`ps -ax` / `ps -p`、`fcntl.flock`、`os.kill(SIGINT)`；`scripts/dsh-superagent` 的 git mode 为 `100755`。 |
| `.gitattributes` / `.editorconfig` | `* text=auto eol=lf` 与 `end_of_line = lf`；POSIX 垫片正文显式写 `\n`，不会因 Windows 开发产生 CRLF 而失效。 |
| `src/client/client.css` | 全仓唯一 macOS 专属规则：`[data-platform='darwin'] .dt-page .dt-head { padding-top: var(--dsh-frame-top-clearance, 0px); }`。 |

**验证边界**：

| 能力 | GitHub `macos-latest` | Mac 真机 |
| --- | --- | --- |
| `pnpm typecheck`、`pnpm build`、`lib/` 构建一致性 | ✅ 可验证（CI） | — |
| 全量 `vitest`（含 POSIX-only 用例与 POSIX 孪生包装器用例） | ✅ 可验证（CI） | — |
| DSH 桌面端面板注入、`[data-platform='darwin']` 安全区实际生效 | ❌ 无法验证（CI 不加载 Electron 桌面端） | ❌ 无真机条件，**静态推断，未经运行时验证** |
| Gatekeeper 对未签名 CLI 的拦截 | ❌ 无法验证 | ❌ **静态推断，未经运行时验证** |
| Keychain 凭据 | ❌ 无法验证 | ❌ **静态推断，未经运行时验证** |
| `gh` / `git` 安装路径与 `dsh` CLI 解析 | ❌ 无法验证（CI 镜像与真机环境不同） | ❌ **静态推断，未经运行时验证** |
| Mode A / Mode B 端到端首单 | ❌ 无法验证 | ❌ **静态推断，未经运行时验证** |
| 真实 `tmux` / BSD `ps` / `fcntl.flock` 行为 | ❌ 契约测试用假 `ps` / `tmux`，CI 不触真实实现 | ❌ **静态推断，未经运行时验证** |

**macOS 相对 Linux 的差异与风险**（以下全部为静态推断，未经运行时验证）：

- **tmux**：macOS 不自带 `tmux`，真机需 `brew install tmux`；缺失时启动器按现有逻辑报
  `Both dsh and tmux must be on PATH.`。CI 的 `service-script.spec.ts` 使用假 `tmux`，不能证明真机路径。
- **BSD `ps` 与 GNU `ps`**：启动器用 `ps -ww -ax -o pid=,ucomm=,args=` 与 `ps -ww -p <pid> -o …` 读取进程；
  BSD/macOS 的 `ucomm`、列宽与输出细节可能不同。CI 同样用假 `ps`，真实 BSD `ps` 未被覆盖。
- **`fcntl.flock`**：POSIX 分支用 `fcntl.LOCK_EX | LOCK_NB` 做 profile 级互斥；macOS 本地 APFS 通常支持，
  但网络卷 / 非 APFS 文件系统上的行为未验证。
- **运行时依赖**：真机需要 Python 3.8+ 的 `python3`（Xcode CLT 或 Homebrew）与 Node `^22.19.0 || >=24`；
  GitHub macOS 镜像自带这些，但干净的 Mac 不保证。
- **SIGINT 与路径比较**：`os.kill(pid, SIGINT)` 在 macOS 可用，但 DSH 是否同样优雅退出没有真机记录；
  默认 APFS 大小写不敏感，`sameDirectory()` / `realpath` 的路径比较在大小写混用下未验证。

**结论**：macOS 与 Linux 共用同一 POSIX 代码分支，逻辑上可安装、bundle 无平台门槛；但 Mac 真机层
**没有任何运行时验证证据**。因此 macOS 等级保持 **Tier 3**，不得写成 Tier 2 或 supported；对外措辞仍为
「适配进行中」。Linux 已在 run 42835530222 首次全绿，Tier 2 升级待派单方验收确认。

## 3. 平台差异台账（按代码归属）

下表以 `WINDOWS-SETUP.md` §11 的 17 条差异为输入，按**代码归属**重组；
同一事实只在本文档登记一次，`WINDOWS-SETUP.md` §11 保留 Windows 侧已验证的操作者视角记录。
「macOS / Linux」列中的行为指 POSIX 分支；两平台真正不同的地方单独标出。

### 3.1 服务启停

| 项 | 代码归属 | Windows | macOS / Linux |
| --- | --- | --- | --- |
| 启动方式 | `scripts/dsh-superagent` | `CREATE_NO_WINDOW` 分离进程；`scripts/dsh-superagent.cmd` 是入口 | `tmux` 会话；直接调用 Python 脚本 |
| 进程发现 | 同上 | `service.pid` + `OpenProcess` / `GetExitCodeProcess` | `ps -ax` / `ps -p` + `fcntl` |
| 优雅停止 | 同上 | 命名管道 → 预加载 `scripts/dsh-service-hook.mjs` → DSH 的 SIGINT 钩子 | `os.kill(pid, SIGINT)` |
| 互斥锁 | 同上 | `msvcrt.locking` 字节锁 | `fcntl.flock` |
| 退出码语义 | 同上 | 0 / 1 / 2 / 3，与 POSIX 相同 | 0 / 1 / 2 / 3 |
| 平台细节 | 同上 | 无 tmux；`--profile` / `--patch` 参数顺序有约束 | tmux 不存在时 `start` 报错；BSD `ps` 与 GNU `ps` 输出按 `-ww -o` 统一 |

契约测试：Windows 见 `tests/service-script-windows.spec.ts`（`describe.skipIf(!WINDOWS)`）；
POSIX 见 `tests/service-script.spec.ts`（`it.skipIf(WINDOWS)`，用假 `ps` / `tmux` / `dsh`）。

### 3.2 命令垫片

| 项 | 代码归属 | Windows | macOS / Linux |
| --- | --- | --- | --- |
| 文件名 | `src/infra/environment.ts` `writeEnvironment()` | `<name>.cmd`，经 PATHEXT 解析 | 无扩展名 `<name>` |
| 首行 / 标记 | 同上 | `@echo off`；`@REM # Written by dsh-superagent …` | `#!/bin/sh`；`# Written by dsh-superagent …` |
| 文件模式 | 同上 | `0o644` | `0o755` |
| PATH 剥离 | 同上 | `%~dp0` 比对 + `for` 拆分 + `endlocal & set`；分隔符 `;` | `self=` 比对 + `for` + `IFS=:`；分隔符 `:` |
| 调用真实 CLI | 同上 | 绝对路径 + `%*` + `exit /b` | `exec '<cli>' "$@"` |
| 被禁命令 | 同上 | `>&2 echo …` + `exit /b 1` | `echo '…' >&2` + `exit 1` |
| 幂等 / 归属识别 | `written()` / `own()` | 按 `/\r?\n/` 切前两行，剥行首 `@REM`，再匹配标记 | 按 `/\r?\n/` 切前两行，直接匹配标记 |

契约测试：`tests/windows-port.spec.ts` 按 `process.platform` 参数化断言，两平台都验证 shim 生成、
PATH 剥离与幂等性；`tests/environment.spec.ts` 覆盖 POSIX 垫片的执行语义。

### 3.3 账号注入

| 项 | 代码归属 | Windows | macOS / Linux |
| --- | --- | --- | --- |
| 选定智能体账号 | `agentVariables()`、`agentGhConfig()` | 注入 `GH_CONFIG_DIR=<stateDir>/gh-config` | 由智能体 CLI 包装器自行设置 `GH_CONFIG_DIR`（上游文档模型） |
| 启动检查 / 探针 | `src/deployment.ts` `workerProbe()` | 显式环境层传 PATH + `GH_CONFIG_DIR` | `env PATH=… <cli>` 前缀 |
| 当前状态 | — | 已实测（见 `WINDOWS-SETUP.md` §12.1） | POSIX 分支保持上游语义；双账号 Mode B 未在 POSIX 实测 |

两种账号模型（`GH_CONFIG_DIR` 与包装器脚本）目前仍并存，统一属于后续阶段；本文档只登记差异，
不把任一侧写成「三平台已经一致」。

### 3.4 准备命令

| 项 | 代码归属 | Windows | macOS / Linux |
| --- | --- | --- | --- |
| shell | `src/executor/dsh.ts` | `cmd.exe /d /s /c <command>` | `sh -c <command>` |
| 变量语法 | 同上 | `%VAR%`、`&&` 等 cmd 语法 | `$VAR`、`&&` 等 POSIX 语法 |
| 后果 | — | 同一份 `executor.prepare` 不能跨平台复用，需按平台配置 | 同左（与 Windows 相反） |

这是配置层的已知分裂，修复属于后续阶段；P0 只确认 POSIX 分支仍走 `sh -c`，并有测试覆盖。

### 3.5 包装器调用

| 项 | 代码归属 | Windows | macOS / Linux |
| --- | --- | --- | --- |
| `.cmd` / `.bat` 包装器 | `runAsWorker()` | 交给 `cmd.exe /d /c`，程序与参数作为**分开的 argv** | 无此机制，直接 spawn |
| 普通可执行文件 | 同上 | 直接 spawn（`.exe` / 原生程序） | 直接 spawn |
| 参数透传 | 同上 | `%*` 与 cmd 引用规则；契约测试覆盖 | Node 逐项引用，shell 不再解析；契约测试覆盖 |

### 3.6 路径、工具名与面板

| 项 | 代码归属 | Windows | macOS / Linux |
| --- | --- | --- | --- |
| `stateDir` 绝对路径校验 | `src/deployment.ts` `absolute()` | 接受 `C:/…`、`D:\…` 或 `/…` | 接受 `/…`；盘符拼写也按字符串接受 |
| 默认 `stateDir` 派生 | `src/deployment.ts` `defaultStateDir()` | `homedir()` / `DSH_HOME`，无平台专有路径 | 同左 |
| 主 Session 工具名 | `src/app/sessions.ts` | 从实时工具注册表取，不硬编码 `bash` / `pwsh` | 同左 |
| 面板安全区 | `src/client/client.css` | 无额外留白 | `[data-platform='darwin']` 顶部留白（macOS 专有） |
| 启动器入口 | `scripts/dsh-superagent.cmd` / `.ps1` | 有 `.cmd` 入口与 PowerShell 辅助入口 | 无等价封装，直接调用 Python 脚本 |

### 3.7 发布、飞书与历史外壳

| 项 | 代码归属 | Windows | macOS / Linux | 状态 |
| --- | --- | --- | --- | --- |
| 本地发布门禁 | `package.json` `release:check` → `scripts/release-check.ps1` | PowerShell 可执行 | 无等价脚本 | 已知差异，后续阶段迁移 |
| 飞书探针 | `src/deployment.ts` `resolveFeishuBot()` | `probe()` 不再外包 `env`，当前实现仍拼了 `env` 前缀，启用飞书 Source 时有已知风险 | `env` 前缀有效 | 已知问题，后续阶段修复 |
| 桌面 Electron 外壳 | `windows-app/`（2026-11-07 移除） | 历史记录，不再是现行部件 | 同左 | 仅 provenance，不构成平台差异 |
| 网络传输 | `SUPERAGENT_GIT_SSH`、代理环境变量 | 与平台无关 | 与平台无关 | 文档见 `WINDOWS-DELTA.md` §8 |

## 4. 当前状态与证据索引

| 结论 | 证据 |
| --- | --- |
| CI 已改为三平台 matrix（`ubuntu-latest` / `macos-latest` / `windows-latest`，`fail-fast: false`） | `.github/workflows/ci.yml` |
| 公开仓标准 GitHub-hosted runner 免费（含 `macos-latest`），保留 macOS runner 没有成本障碍 | <https://docs.github.com/en/billing/managing-billing-for-github-actions/about-billing-for-github-actions> |
| macOS 测试层与真机层的验证边界、静态代码审查 | 本文档 §2.1 |
| `lib/` 与新鲜构建一致的门禁在三个 runner 上都能跑（`shell: bash`） | 同上 |
| Windows 契约测试不再依赖「整个文件只在 Windows 跑」 | `tests/windows-port.spec.ts` |
| Windows 启动器分支 | `tests/service-script-windows.spec.ts` |
| POSIX 启动器分支（tmux / ps / fcntl / SIGINT） | `tests/service-script.spec.ts` |
| POSIX 垫片、git 配置、路径剥离、符号链接 | `tests/environment.spec.ts`、`tests/deployment.spec.ts` |
| Windows 操作者视角的 17 条差异与 E2E 记录 | `WINDOWS-SETUP.md` §11 / §12 |
| 上游基线与逐处改动、升级流程 | `WINDOWS-DELTA.md` |
| Windows 本机测试基线 | `1282 passed / 49 skipped`（2026-11-10 全量实测；`AGENTS.md` §4 的 `1226 / 48` 是更早的基线，6f429c3 的用例总数更多） |
| 首次三平台 CI（run 42833259273，2026-11-10） | <https://github.com/ReSerendipity/dsh-superagent/actions/runs/42833259273>：`windows-latest` 绿；`ubuntu-latest` / `macos-latest` 红。3 个 POSIX 侧失败：F1 `tests/deployment.spec.ts` 断言未包含当前 `machineOf` 契约的 `mode` / `configPath`（测试断言过期）；F2 `tests/sources.spec.ts` 飞书 health 被迟到的 `[event] ready` 覆盖（产品跨流竞态）；F3 `tests/config-watch.spec.ts` 在 macOS `fs.watch` 空文件名时放行邻居事件（产品缺陷）。修复后待重跑，未提前写成已通过 |
| 第二次三平台 CI（run 42835530222，2026-11-10） | <https://github.com/ReSerendipity/dsh-superagent/actions/runs/42835530222>：`windows-latest` / `ubuntu-latest` 绿；`macos-latest` 仍 1 红（`tests/config-watch.spec.ts` 邻居误触发，`1 failed / 1325 passed / 5 skipped`）。F1 / F2 已在 Ubuntu 实测通过。F3 的首次修复只拦截了无文件名事件；`fired` 从 0 变 1，但无文件名分支本应因目标指纹未变而返回，反推出 macOS FSEvents 把邻居写入报成了匹配 `names` 的命名事件，`ebba31d` 的 `if (changed)` 分支因此绕过指纹比较。二次修复不再信任 `changed`，每个目录事件都核对被监听文件的 inode/mtime/ctime/size 指纹；邻居写入不改变指纹，原子保存仍改变 inode，待第三次 macOS CI 验证 |

### 4.1 只能在 CI 验证的结论

- Linux 的 `pnpm install --frozen-lockfile`、`pnpm typecheck`、`pnpm build` 与 `lib/` 一致性；macOS 的**测试层**同样只能由 CI 验证。
- 约 48 项既有 `skipIf(WINDOWS)` 用例在 POSIX 的首次真跑结果（另有 1 项新增的 POSIX 包装器对等用例）；本机只能跑 Windows 侧。
- `timeout-minutes: 20` 是否足够，尤其 macOS runner。
- `tests/portability.spec.ts` 在 CI 账号（`runner` / `runneradmin`）下不误报机器路径。
- F1 / F2 已由 run 42835530222 的 Ubuntu 侧确认；F3 的二次修复只能由下一次 `macos-latest` CI 验证；本机 Windows 侧这些用例大多跳过，不能据此宣称 macOS 已修复。
- macOS 真机层（桌面端注入、Gatekeeper、Keychain、端到端首单）**不在 CI 能力范围内**，见 §2.1；CI 全绿不构成真机证据。

### 4.2 P0 之后的开放项

- 重跑 `macos-latest` 验证 F3 二次修复。Linux 已在 run 42835530222 首次全绿，Tier 2 升级待派单方验收确认；macOS 仍保持 Tier 3。
- macOS 真机的安装、DSH 桌面端、Gatekeeper / Keychain 与端到端首单（Mode A / Mode B）；Linux 的安装说明与端到端首单。
- `GH_CONFIG_DIR` 与包装器两种账号模型的统一。
- `executor.prepare` 的跨平台配置策略。
- `release:check` 的 POSIX 实现。
- 飞书探针的 `env` 前缀问题。
- `docs/WINDOWS-SETUP.md` / `WINDOWS-DELTA.md` 是否改名（决策待定）。

## 5. 维护约定

- 新增平台差异先改本台账，再改 `WINDOWS-DELTA.md` 的逐处清单；同一事实不写两遍。
- 支持等级只在证据齐备后上调；CI 变红或 E2E 失效时立即下调，并在本节记录日期与原因。
- 对外文档（README、包描述）只描述**已达到**的等级，不提前写 "supported"。
