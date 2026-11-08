# DSH-Superagent

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Upstream](https://img.shields.io/badge/upstream-dsh--superagent--prototype-0969da)](https://github.com/deepseek-ai/dsh-superagent-prototype)
[![Platform](https://img.shields.io/badge/platform-Windows%2010%2F11-lightgrey)](#安装)
[![Node](https://img.shields.io/badge/node-%5E22.19.0%20%7C%7C%20%3E%3D24-3fb950)](#安装)

> **DSH-Superagent 是 DeepSeek Harness 的一个非官方插件**：把 GitHub 仓库（issue / PR / 评论 / CI）、本地收件目录或飞书群聊里的事件，变成一条条可执行的工单——每条工单在上下文隔离的 DSH 会话里完成，再把结果回贴到原处。
>
> **非官方产品**：上游代码与设计由 DeepSeek Harness Team 以 MIT 授权，本仓新增部分同样以 MIT 发布；归属与分工见 [NOTICE](NOTICE)。

## 安装

**在 DeepSeek Harness 应用里**：插件 → 添加插件，粘贴包名 `@reserendipity/dsh-superagent`；等价的命令行是：

```powershell
dsh plugin --profile superagent add "@reserendipity/dsh-superagent"
```

装的是 npm 上已发布的版本（当前 `0.1.0`）。**也可以从本仓的 Git 地址安装**：

```powershell
dsh plugin --profile superagent add "git+https://github.com/ReSerendipity/dsh-superagent.git"
```

Git 方式装的是 `main` 当前最新提交；`dsh plugin add` 把 spec 原样交给 pnpm，锁文件会记下解析到的具体 commit。

**可选：锁定某个提交。** 团队统一版本、复现问题或 CI 需要固定构建时，在地址末尾加 `#<40 位 commit>`：`dsh plugin --profile superagent add "git+https://github.com/ReSerendipity/dsh-superagent.git#<40 位 commit>"`。代价是升级要手动换 sha，否则会一直停在旧版。

仓库自带 `lib/` 构建产物，安装时不需要再构建。要求 Node `^22.19.0 || >=24`、DeepSeek Harness `>=0.2.1-alpha.2 <0.3.0`；一个 `stateDir` 只允许一个后端（锁保护）。

**装完还要做一步：给 profile 配 `stateDir`。** 插件配置里的 `stateDir` 是必填项，**故意没有默认值**：一个 `stateDir` 只允许一个后端（`<stateDir>.lock`），若给共享默认值，两个 profile 会抢同一把锁。没有配置时主页件会报 `ValidationError: invalid config: - $.stateDir missing required value (at stateDir)`。编辑 `%USERPROFILE%\.dsh\profiles\<profile>\cordis.patch.yml`：

```yaml
- id: dsh-superagent
  config:
    stateDir: C:/Users/<you>/.dsh/state/superagent
```

每个 profile 用各自的目录（例如 `.../state/superagent-team-b`）。可直接复制的完整示例见 [`examples/profile.cordis.patch.yml`](examples/profile.cordis.patch.yml)，它随包发出。

**只用本地收件目录（`mode: local`，不配 GitHub）** 还要三件套：`mode: local`、关掉 GitHub Source、启用 inbox Source：

```yaml
- id: dsh-superagent
  config:
    stateDir: C:/Users/<you>/.dsh/state/superagent
    mode: local
- id: dsh-superagent-github
  disabled: true
- id: dsh-superagent-inbox
  disabled: false
```

收件准入名单也必须非空（面板 设置 → 评估 → 谁可以派活，加一行 `local`），否则投单会被判 `not_a_member` 并静默归档，不写回信。

tarball、本地目录、独立 profile 与常驻服务见 [WINDOWS-SETUP.md](docs/WINDOWS-SETUP.md)。发布状态：本仓以 `v0.1.0` 为公开基线，已发布到 npm 为 `@reserendipity/dsh-superagent`（版本以本版 `package.json` 为准）；离线跑 `pnpm release:check -SkipOnline`（被跳过的在线检查会标成 `NOT VERIFIED`）。

![插件管理器「已安装插件」：DSH-Superagent 开关为启用](https://gcore.jsdelivr.net/gh/ReSerendipity/dsh-superagent@main/docs/assets/readme-plugin-installed-20261108.png)

> **图**：插件管理器「已安装插件」列表中 DSH-Superagent 的开关为启用状态，模式 `mode: local`。
> **Figure**: in the plugin manager's installed-plugins list the DSH-Superagent switch is enabled; mode `mode: local`.

## 它是什么

单个 Coding Agent 已经能干活，但工作单位仍是「一次会话」：并行推进多项工作时，人得手动切换、记住上下文。DSH-Superagent 把这类工作变成**可排队、可观察、可回贴的工单**：一个仓库或一个收件目录连续产出事件，程序层准入与语义层评估决定哪些变成工单，每条工单在独立目录、上下文隔离的 DSH 会话里执行，完成后回贴评论或开 Pull Request。

它遵循官方文章里的设计：Router 只分派不干活、Worker 隔离执行、程序与模型两级过滤、订阅直通、链式召回、外部控制回路。上游已实现的机制直接复用（例如异步子任务用 Harness 自带的 `subagent`）；与上游的逐项差异和跟随方法见 [WINDOWS-DELTA.md](docs/WINDOWS-DELTA.md)。

![执行页「进行中」：2 张执行中、2 张排队](https://gcore.jsdelivr.net/gh/ReSerendipity/dsh-superagent@main/docs/assets/readme-tickets-20261108.png)

> **图**：执行页「进行中」显示 2 张执行中、2 张排队，执行器运行中（2/2），模式 `mode: local`。
> **Figure**: the Execution tab shows two tickets executing and two queued with the executor running (2/2); mode `mode: local`.

## 它能做什么

| 能力 | 说明 |
|---|---|
| **事件源** | GitHub 的 issue / PR / 评论 / CI 结果；本地收件目录（丢 `.md` 即工单，无需 GitHub 账号）；可选飞书群聊 |
| **判断** | 程序层准入（谁能触发、什么算请求）+ 语义层评估（含糊的消息交给模型，必要时来问你） |
| **执行** | 每个工单一个**上下文隔离**的 DSH 会话，在独立目录里干活；完成后回贴评论或开 Pull Request |
| **运营** | 面板实时看触发/评估/执行/健康；一行运行判读对应 CLI 退出码；Watchdog 与 Router 分片按需开启 |
| **边界** | 插件运行期不依赖 WSL/tmux/Python；执行器按设计有完整 OS 权限——这是操作者信任模型，不是沙箱 |

![概览页：运行判读「正常」，过去 24 小时到达 6 / 接单 6，执行器 2/2](https://gcore.jsdelivr.net/gh/ReSerendipity/dsh-superagent@main/docs/assets/readme-overview-20261108.png)

> **图**：概览页的运行判读为「正常（对应 CLI 退出码 0）」，过去 24 小时到达 6、已评估 6、接单或续做 6，待处理工单 0，执行器 2/2、排队 2；模式 `mode: local`。
> **Figure**: the Overview tab reports a normal run (CLI exit code 0): 6 delivered, 6 evaluated and 6 accepted or continued in the last 24 hours, 0 pending tickets, executors 2/2 with 2 queued; mode `mode: local`.

## 第一次使用

1. **接上事件源**：设置 → 来源，填仓库与 GitHub CLI（或指定本地收件目录），确认状态变成「就绪」
2. **决定谁能触发**：设置 → 评估，把团队成员加入允许名单（名单外的人不会唤起它）
3. **确认判断策略**：明确请求直接接单；含糊的消息走语义评估，必要时来问你
4. **看执行与结果**：执行页看待处理工单，原 Thread 看回贴结果；需要介入时停止/继续

接好来源后，设置 → 来源会逐条显示每个事件源的状态：本机收件目录显示「运行中」并给出 24 小时内的到达数，未装插件的 GitHub 源显示「插件未安装」。

面板第一个标签是**介绍**；第一次打开概览还会给一张三步卡（接来源 → 派一张单 → 看回信）。Watchdog 间隔与 Router 分片在 设置 → 执行 里，默认按需开启，设计与取舍见 [`docs/012`](docs/012-watchdog.md)、[`docs/017`](docs/017-independent-layer.md)。

![设置 → 执行：Watchdog 间隔 30 分钟、停滞判定 45 分钟、Router 分片 2](https://gcore.jsdelivr.net/gh/ReSerendipity/dsh-superagent@main/docs/assets/readme-watchdog-20261108.png)

> **图**：设置 → 执行中执行器模型为 DSH 默认（`modelscope / Qwen/Qwen3.8-Flash-Next`），并行工单数 2、Watchdog 间隔 30 分钟、停滞判定 45 分钟、Router 分片数 2，以上设置已保存并生效；模式 `mode: local`。
> **Figure**: under Settings → Execution the executor model is the DSH default (`modelscope / Qwen/Qwen3.8-Flash-Next`), with two parallel tickets, a 30-minute Watchdog interval, a 45-minute stall threshold and two Router shards saved and in effect; mode `mode: local`.

### 一条工单的样子

![工单详情：已完成，授权详情、订阅的线程，执行环境与标识为收起状态](https://gcore.jsdelivr.net/gh/ReSerendipity/dsh-superagent@main/docs/assets/readme-ticket-detail-20261108-r1.png)

> **图**：一条已完成工单的详情——授权详情（触发原文、决定「接单」、范围、点名方式、策略版本（当时））、订阅的线程；执行环境、渠道与标识三栏保持收起，画面里不出现本机路径；模式 `mode: local`。
> **Figure**: the detail of one completed ticket — mandate details (original trigger, decision "accept", scope, addressing, policy version (at the time)) and its subscribed thread; the execution environment, channel and identifier rows stay collapsed, so no machine path appears; mode `mode: local`.

![执行器会话最终回报：分支 agent/glossary-notes-b36e816a648e、该轮执行的提交](https://gcore.jsdelivr.net/gh/ReSerendipity/dsh-superagent@main/docs/assets/readme-ticket-run-20261108.png)

> **图**：一条工单的执行器会话已完成（用时 1 分 46 秒）并回报：新增 `docs/notes/glossary.md`、分支 `agent/glossary-notes-b36e816a648e`、该轮执行的提交（提交信息带 Signed-off-by）、工作树干净，本地交付未推送、未开 PR；模式 `mode: local`。
> **Figure**: the executor session of one ticket completed (1 min 46 s) and reported back — it added `docs/notes/glossary.md`, committed on branch `agent/glossary-notes-b36e816a648e` with a Signed-off-by trailer, left a clean worktree, and delivered locally without pushing or opening a PR; mode `mode: local`.

## 多实例

一个后端只服务一个 `stateDir`（锁保护）。需要多个上下文边界时开多个 profile / 多个 `stateDir`，各自独立重启。详见 [`docs/015`](docs/015-multi-instance.md)。

## English

**DSH-Superagent is an unofficial plugin for DeepSeek Harness.** It turns GitHub events (issues, pull requests, comments, CI results), a local inbox directory, or an optional Feishu group chat into tickets; each ticket runs in a context-isolated DSH session inside its own working directory and posts its result back.

It is built on the [deepseek-ai/dsh-superagent-prototype](https://github.com/deepseek-ai/dsh-superagent-prototype) and is **not an official DeepSeek product**; additions in this repository are MIT as well — the upstream license and copyright notice are in [NOTICE](NOTICE), the repository license in [LICENSE](LICENSE).

**Install.** *Plugins → Add plugin* in the app and paste `@reserendipity/dsh-superagent`, or run `dsh plugin --profile <name> add "@reserendipity/dsh-superagent"` (the published version, currently `0.1.0`). To install the latest `main` commit instead, use `git+https://github.com/ReSerendipity/dsh-superagent.git`; `dsh plugin add` hands the spec to pnpm verbatim, and the lockfile records the commit it resolved.

**One step after installing:** add `stateDir` to `%USERPROFILE%\.dsh\profiles\<profile>\cordis.patch.yml` — it is required and deliberately has no default, because one `stateDir` allows one backend at a time and a shared default would make two profiles fight over the same lock. Without it the home plugin reports `$.stateDir missing required value`. A copyable example is in [`examples/profile.cordis.patch.yml`](examples/profile.cordis.patch.yml), which ships in the package.

**Optional — pin a build.** For a team-wide version, reproducing an issue or CI, append `#<full 40-character commit>` to the URL (`...git#<commit>`); the cost is that upgrading means editing the sha, otherwise the install stays on that old build. The repo ships built artifacts in `lib/`, so no build step is needed at install time. Requirements: Node `^22.19.0 || >=24`, DeepSeek Harness `>=0.2.1-alpha.2 <0.3.0`; one backend per state directory (lock-protected).

**Honest limits.** Windows only, no macOS/Linux support; executors run with full OS access by design (an operator-trust model, not a sandbox); the public baseline is v0.1.0, published on npm as `@reserendipity/dsh-superagent`; the project is maintained by one person. Differences from upstream are enumerated in [docs/WINDOWS-DELTA.md](docs/WINDOWS-DELTA.md).

## 文档索引

| 文档 | 内容 |
|---|---|
| [`SETUP.md`](docs/SETUP.md) | 给 Agent 读的安装向导（一次一个问题，最后统一执行） |
| [`WINDOWS-SETUP.md`](docs/WINDOWS-SETUP.md) | Windows 上的完整部署与排错 |
| [`WINDOWS-DELTA.md`](docs/WINDOWS-DELTA.md) | 与上游的逐项差异、上游跟随方法 |
| [`CHANGELOG.md`](CHANGELOG.md) | 本仓的版本历史 |
| [`NOTICE`](NOTICE) | 归属与新增部分声明 |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | 本仓内部结构：组件与依赖方向、数据流、外部依赖、边界与非目标、变更影响面 |
| [`docs/000`](docs/000-philosophy.md) | 设计哲学：尽可能少占用人的注意力 |
| [`docs/001`](docs/001-domain.md) | 领域模型：Trigger / Thread / Ticket / Assignment |
| [`docs/002`](docs/002-authorization.md) | 授权：谁能唤起 Agent、准入与两级过滤 |
| [`docs/003`](docs/003-execution.md) | 执行：执行器、会话、报告 |
| [`docs/004`](docs/004-prompts.md) | 提示词：段落组织与团队提示词 |
| [`docs/005`](docs/005-panel.md) | 面板：路由与视图 |
| [`docs/006`](docs/006-deployment.md) | 部署：profile、状态目录、契约 |
| [`docs/007`](docs/007-architecture.md) | 架构：模块与测试清单 |
| [`docs/008`](docs/008-cookbook.md) | 操作手册：常见任务的做法 |
| [`docs/009`](docs/009-declarative-settings.md) | 声明式设置文件 |
| [`docs/010`](docs/010-multi-source.md) | 多来源调研（未采纳的路线与原因） |
| [`docs/011`](docs/011-official-design-conformance.md) | 与官方设计的一致性审查 |
| [`docs/012`](docs/012-watchdog.md) | Watchdog 控制回路 |
| [`docs/013`](docs/013-full-duplex.md) | 全双工交互（§4.1）对照 |
| [`docs/014`](docs/014-chain-of-recall.md) | 链式召回（§3.3）对照 |
| [`docs/015`](docs/015-multi-instance.md) | 多实例：一边界一实例 |
| [`docs/017`](docs/017-independent-layer.md) | 独立实现层：补上游未做的机制 |
| [`docs/019`](docs/019-video-script.md) | 发布视频脚本（分镜 + 旁白） |
| [`docs/020`](docs/020-release-checklist.md) | 发布检查清单：发布前逐项验证与回滚 |
| [`docs/026`](docs/026-local-delivery.md) | `mode: local` 交付形态：选入路径（内置本地工作区）与默认值决策备忘、影响面与回滚 |

## 常见问题

**它会自己改我的仓库吗？** 只在你或名单里的人请求、或团队写下的规则允许时行动；它写出的内容都在它自己的账号名下，
并出现在原 Thread 里。自动合并默认关闭。

**必须有自己的 GitHub 账号吗？** 分两条路线，见 [`WINDOWS-SETUP.md`](docs/WINDOWS-SETUP.md) §6.0。走 **Mode B**（GitHub 派单、团队语义）需要专用智能体账号——它做的事都记在那个账号名下，不要用你自己的主账号。走 **Mode A**（本地收件目录派单）不需要第二个账号：丢文件即请求，结果写回信文件。两条路线都遵守「派单账号 ≠ 执行账号」。

**需要常开一台机器吗？** 是。它是常驻进程；进程停了就不工作。外部可以挂一个定时检查（见 [`WINDOWS-SETUP.md`](docs/WINDOWS-SETUP.md)）
作为最外层兜底。

**数据存在哪里？** 每个实例一个状态目录，由 profile 的 `cordis.patch.yml` **显式指定** `stateDir`（没有默认值）：数据库、锁、工单目录、凭据目录。
卸载插件不会删它。

**仓库里有没有绑定开发机的地方？** 没有。所有路径运行时推导，文档只用 `<install>`、`%LOCALAPPDATA%`、`<checkout>`
这类占位符；`tests/portability.spec.ts` 会扫描仓库内的文本文件（含 `lib/` 构建产物、`.css` 与无扩展名文件），
用户名与 home 目录在运行时从 `os.userInfo()` / `os.homedir()` 推导，出现开发机的绝对路径或用户名就让测试失败。

**安装时报 `UNABLE_TO_VERIFY_LEAF_SIGNATURE`？** 这台机器或网络边界有 TLS 中间盒（公司代理、杀毒软件的 HTTPS 扫描），git 不认它的根证书。这与插件无关，克隆任何 GitHub 仓库都一样。把代理根证书导入系统信任区，或 `git config --global http.sslCAInfo <ca-bundle.pem>` 指向它的 CA 包；Node 侧需要时设 `NODE_EXTRA_CA_CERTS`。不要用 `http.sslVerify false` 绕过。详见 [`WINDOWS-DELTA.md`](docs/WINDOWS-DELTA.md) §8.5。

**为什么显示名和包名不一样？** 显示名是 DSH-Superagent；npm 包名是 `@reserendipity/dsh-superagent`（npm 公开包按作者 scope 归类）。包名是安装契约（插件 id、profile 依赖、内部路径），改动会破坏已安装实例；显示名只是给人看的。

## 目录结构

```
src/             插件本体（TypeScript）：来源、核心、执行器、面板服务
locale/          面板与插件页的显示名、描述（中英）
prompts/         提示词段落
docs/            编号设计文档（当前保留 000–015、017、019、020、026）与 Windows 操作说明
scripts/         启动/停止/状态脚本
tests/           单元与面板测试（文档与代码一致性也在其中）
```

## 开发与发布

- 开发与提交约定见 [CONTRIBUTING.md](CONTRIBUTING.md)；本地跑 `pnpm typecheck` 与 `pnpm vitest run`。
- 发布前跑 `pnpm release:check`（逐项 PASS/FAIL，失败退出码非 0）；在线两项核对 `releases/tags/v<版本>` 的资产与本地打出的 `.tgz` digest——改过打包内容（`package.json`、`files`）之后对已发布版本必然不一致，这是预期的「不要用旧资产冒充新构建」，新版本要等新 tag 与新资产。细则见 [`docs/020`](docs/020-release-checklist.md)，视频脚本见 [`docs/019`](docs/019-video-script.md)。
- 变更历史见 [CHANGELOG](CHANGELOG.md)。

## 致谢与归属

- **设计思想来源**：官方文章《Super-agent 设计探索：迈向更自主的 Agent 系统》。
- 上游与第三方来源的许可与版权声明统一写在 [`NOTICE`](NOTICE)；本仓许可见 [`LICENSE`](LICENSE)。
- `NOTICE` 与 `examples/` 都在发布包的 `files` 白名单里，所以安装副本内 `README` 指向 `NOTICE` 的相对链接同样有效。

## 许可

MIT，见 [`LICENSE`](LICENSE)。
