# DSH-Superagent Changelog

## [0.2.8] — 2026-11-13

深度审查修复批次（2026-11-12/13 全仓审查，报告见 `local/review-2026-11-12.md`）：6 条 P1、20 余条 P2 与 P3 卫生项全部处理，测试基线 1307 passed / 49 skipped。

### Fixed

- **Windows 运行期 `.cmd` 包装 CLI 全部 EINVAL**（P1）：setup 探针经 `runAsWorker` 能启动 `.cmd` 包装器，而轮询/回帖/git 的 `Commands.run` 与飞书 consume 直接 `execFile`/`spawn`，Node 因 CVE-2024-27980 加固直接拒绝。`infra/platform` 新增 `runtimeArgv`，三处 spawn 收敛到同一 argv 形态（`cmd.exe /d /c` + 程序与参数分立），Windows 契约测试真跑验证。
- **`executable()` 不展开 PATHEXT**（P1）：Windows 上 `cli: "gh"` 恒失败；裸命令名现按 PATHEXT 展开（与 CreateProcess 同序），含反斜杠的相对名被拒绝而非静默拼接。
- **inbox 半写入文件被吞成工单并重复建单**（P1）：接件加 2 秒稳定性门，云同步落地/慢拷贝的文件等下一轮整读；归档移动仍是游标。
- **多实例同 kind 的门按 kind 而非实例**（P1，过渡方案）：多实例仍被 setup 拒绝（docs/010 维持），但单个以自定义 id 存储的实例现在按**自己的**配置判定 scope 与 thread context，不再落到 schema 默认值静默失效。
- **登录自启 VBS 是语法错误的**（P1）：`sh.Run` 引号 4 个应为 3 个——每次安装都写出坏 VBS，守卫从未自启过；同时让发射行逃出括号块（检出路径含 `)` 会击穿块解析），错误路径改 goto。`tests/guard-installer.spec.ts` 按 cmd/wscript 双重语义解析生成文本钉死。
- **policy/prompts 可被主 Session 工具改写**（P2）：tool origin 改 policy 块或改 prompt overrides 一律拒绝并指向面板（与 `panelOnlyEnvironment` 同型）；Source 自身名单同步与面板不受影响，团队段落/技能仍可由工具编辑。
- **chat 回信简报链**：Mode A 回信简报改 `queue`（steer 对空闲聊天静默丢弃，与进程内路径注释一致）；`ChatReplyWatcher.tick` 加重入守卫；`chatTickets` 重启后从持久化 Trigger meta 兜底恢复；brief 截断不再切碎代理对。
- **watchdog**：digest 的 queued 只数等槽位的工单（原来把等人的也算进去）；`watchdogMinutes` 保存后下一 tick 即生效（原来要重启，而 instance-status 却已报新值）。
- **worker git 配置检查**：`verifyDirectory` 白名单扩到 `http.*` 整族（`sslVerify=false` 会放走 credential helper 的令牌）与 `url.*.insteadOf`，且**每次 launch** 复查而非只在建目录时；工作区路径被文件占位时报清晰错误。
- **状态锁回收竞争**：两个进程同时回收死锁时败者不再抛 ELOCKED，胜者若也死了再试一轮。
- **关停**：effect handler 无视停止信号时 `drain()` 以 30 秒为限，超时继续释放锁；Router 分片与 Watchdog 会话也纳入取消列表。
- **声明式配置链**：YAML `__proto__`/`constructor` 键响亮拒绝（原来静默吞掉并变异原型）；未知 `$` 指令拒绝（`$prunes` 拼写错误原来无声消失）；`$prune` 指向不存在的 Source 告警；补丁失败的文件报 `DeclarativeWriteError` 而非裸 500；替换写入先 fsync 再 rename；`patchJson` 路径遍历 hasOwn 守卫；面板同毫秒同题建单不再互相覆盖。
- **client**：API 请求带 15 秒超时（挂起请求不再冻结该视图的轮询队列与 reload）；右栏任务动作失败就地显示错误（原来 `catch {}` 全吞，且 tasks-pane 零测试——现补齐 PS 语法门同级的用例）；概览问题行稳定 key（轮询重排不再把确认弹窗错位到别的问题上）；gap 回填失败不再每 5 秒弹一次 toast；外链只渲染 http(s)/飞书 applink；settings provider context 记忆化；`reasonLabel` 用字典分隔符；chatRouter `maxParallel` 清空不再瞬间变 0；`{{双花括号}}` 占位符渲染残留修复并加渲染级断言。
- **sendGithub 幂等**：outbox 已有的 delivered 回执现在短路全量翻页扫描（千评论 issue 每条消息省 ~34 次 API 调用），扫描仅作为响应丢失的恢复路径；评论分页 `per_page=100`；渠道首次有了直接测试。
- **脚本链**：`dsh-superagent.cmd` 引号包裹 Python 路径（Program Files 安装可用）；服务 pid 记录进程创建时间（Windows PID 复用不再造成幽灵服务/守卫永久压制）；guard 启动前先查 disabled 标记；watchdog 签名剔除易变字段并合并路径转义（同一故障不再重启后重复 ALERT）；控制管道丢弃超限请求；`serves()` 收紧到无位置参数的服务形态；PowerShell 三脚本有了语法门测试。
- **schema**：`policy.sources.<id>.bots` 声明进 `SourcePolicySchema` 并重新生成 JSON Schema——编辑器可补全，拼错 `bot` 不再静默清空机器人名单。
- **文档**：`cordis.patch.yml` 头注释与 0.1.5 起的可选 stateDir 一致；SECURITY.md 写明控制管道的本地信任边界；README 文档索引完整性由测试锁定；`github/` 资源说明明示「不按工单隔离」；`CHAT_ROUTER_PROMPT` 与随包 .md 一致且有同步测试。
- **杂项**：`transient()` 只认被点名的 HTTP/status/code 数字（`limit 500 reached` 不再买指数退避）；`runAsWorker` 空错误不再回显整条 argv；migration 的 NaN 游标键/孤儿行/死旗标防御补齐；`Store.get` 对损坏 JSON 读作缺失而非启动失败；`Store.settings()` 按版本缓存；线程列表与工单标题搜索下推 SQL；`KV.feishu.seen` 封顶；inbox 健康详情带最近一次错误；收件文件 URL 百分号编码；issue 标题 mention 与正文同等计为 addressed；被删除实例的健康条目释放。

### Notes

- 审查方法与逐条证据：`local/review-2026-11-12.md`（本仓本地保留）。
- `src/core/**` 与上游逐字节一致经复核未变；本批次全部改动在平台层。

## [0.2.7] — 2026-11-10

首个通过端到端 MVP 验收的版本（5/5：派发新单 → 独立工单与 worker → 真实执行 → 右栏可见 → 完成回投）。

### Added

- **右侧栏「总管任务」标签**：`sidebarRightTabs` 注册标签类型 + `sidebar.right.pane.tab` 注册正文，key 与标签 id 一致；宿主无该能力时只告警、不阻塞启动。
- **卡片式任务面板**：状态配色（completed 绿 / working 蓝 / stopped 红 / person 橙）、hover、摘要两行截断与点击展开、按「进行中 / 已完成」分组。
- **搜索与筛选**：按标题或摘要搜索；`全部 / 进行中 / 已完成` 切换。
- **手动刷新**：`⟳` + 「刷新于 HH:MM:SS」，自动轮询仍为 5 秒。
- **右键菜单**：打开会话 / 重试 / 停止。
- **主对话跳转**：卡片底部「来自 xxxxxxxx」可点击回到发起派发的主对话。
- **`report_state`**：卡片显示 worker 最近一次报告状态（progress / waiting / ready / blocked / failed / dropped）。

### Fixed

- **派发被并入旧工单**：`dispatchChatTask` 的 Thread 每个主对话固定，新请求被 Intake 挂到该 Thread 的既有工单（即使已 completed），导致不建新单、旧单被翻活、`outcome` 被覆盖。改为每次派发一个独立 Thread。
- **完成简报静默丢失**：`reportToChat` 用 `steer`，只送达运行中的回合；主对话派完单即空闲，简报被 `.catch(() => {})` 吞掉。改为 `queue`，失败时 `console.warn` 留痕。
- **新工单建不出来**：`decide` 的 accept 缺 `name`，`ticketWorktreeName("")` 必抛 `WorktreeNameSchema`。`chat_dispatch` 增加可选 `name`（kebab-case），`dispatchChatTask` 对缺失/中文/非法值兜底 `task-<base36>`。
- 启动安全：`layout` 按需读取（`ctx.get('layout')`），右栏 slot 缺失不阻塞 entry。

### Notes

- 验收记录：`dsh-superagent-0.2.7-e2e-checklist.md`；实测报告由 Qoder 复测产出（5/5）。
- 未覆盖：右键「停止/重试」端到端用例——本机 `local-qwen` 的 8081 被 CatPaw 占用、`health.evals=error`，无法制造可停止的 working 窗口。
- 历史遗留：2026-11-10 17:15–17:17 的 9 个孤儿触发器（无 decision）仍在库中，不影响新派发，需退出 DSH 后清理。

## [0.2.6] — 2026-11-10

### Fixed

- **0.2.5 会让 DSH 启动失败**：`web boot: 1 entry did not activate / @reserendipity/dsh-superagent: failed`。原因是客户端 `inject` 把 `layout` 当成了必需依赖，而宿主在插件激活时该服务尚未就绪，整个 entry 停在 pending，导致应用无法启动。现在 `layout` 改为按需读取（`ctx.layout?.selectPanel`），不再阻塞激活。
- 受影响版本：仅 0.2.5。请升级到 0.2.6；0.2.5 已发布不可撤回。

### Notes

- 0.2.5 的右栏「总管任务」标签保持不变，只是不再硬依赖 `layout` 服务。

## [0.2.5] — 2026-11-10

### Added

- **右侧栏「总管任务」标签**（`sidebar.right.pane.tab`）：像 dsh-pet 的对话面板那样，右侧栏多一个标签，列出总管派出的工单（标题 + 阶段），每条带「打开会话」直达 `worker-<ticket id>`，不必切到插件主面板。
- 该 slot 由 DSH 0.2.0-rc.1 引入，本包 devDependencies 的类型集较旧，因此在 `src/client/index.tsx` 里做了 module augmentation；宿主没有该 slot 时注册无副作用。
- 客户端复用 `caller`/`messages` 直接请求 `GET chatRouter/tasks`，右栏面板不依赖插件主面板的 React context。

### Notes

- 右栏标签在宿主声明该 slot 后才注册（generator 形式的 `slots.inject`），避免「打开标签却空白」。
- 面板路由记忆仍生效：点侧边栏图标会回到上次停留的页。

## [0.2.4] — 2026-11-10

### Added

- **侧边栏底部「总管任务」快捷按钮**（`sidebar.footer.action`）：点击直接打开插件面板；面板会回到上次停留的页（例如「执行」），从侧边栏到任务/设置少一层跳转。
- 面板客户端注入 `layout` 服务（`ctx.layout.selectPanel`），用于选中本插件的主面板。

### Notes

- DSH 的侧边栏只提供两种插件入口：`sidebar.panellist`（每个插件一个图标）与 `sidebar.footer.action`（底部按钮）；`sidebar.settings` 由 ui-settings 独占，插件无法把设置项直接铺进侧边栏。这是宿主 slot 契约的限制，不是本插件的取舍。

## [0.2.3] — 2026-11-10

### Added

- **面板「总管任务」列表**：设置 → 执行页顶部新增区块，列出总管派出的工单（标题 + 阶段），每条带「打开会话」按钮，直接打开对应的 `worker-<ticket id>` 会话，不必再去 DSH 左侧工作区翻找。
- 新增只读路由 `GET chatRouter/tasks`：按 `trigger.meta.dispatchedBy === 'chat-router'` 过滤工单，返回 `ticketCard` 字段外加 `chat_session`（发起派发的主对话）与 `worker_session`（执行会话）。

### Notes

- 列表最多 20 条，按工单存储顺序倒序。
- 主对话内的任务卡仍是文字形式（`chat_dispatch` 返回的 `ticket_id`）；内嵌可视化卡片未做。

## [0.2.2] — 2026-11-10

### Added

- **总管派发的工单结束后自动回投主对话**：`Runtime` 在建单时记录 `ticketId → 发起派发的 chatSessionId`，在 `ticket.ended` 领域事件里通过 `sessions.prompt` 投递一条限长简报（`briefOf(report.summary, 400)`），内容是结束结果（completed / stopped / dropped …）+ worker 的报告摘要。主对话不再需要轮询，也不会出现"说好会回报却没回报"。
- 简报只带报告摘要；完整执行过程仍在 `worker-<ticket id>` 会话里（DSH 左侧对应工作区可直接打开）。

### Notes

- 面板任务列表与「打开 worker 会话」按钮仍未做，下一步。
- 本次未补 `tests/runtime.spec.ts` 的回投用例；现有 1282 个测试全绿。

## [0.2.1] — 2026-11-10

### Fixed

- **`chat_dispatch` 不再依赖 Router 会话**：原先写一个 inbox 文件，等 inbox Source 轮询、再由 Router 主 Session 用 `orchestrator_route` 决策；Router 会话一旦 `blocked`（模型不可达、被归档等），派发就静默失败，而主对话仍显示"已派出"。现在直接把任务作为 explicit Trigger 交给 Engine 并立即 accept（`engine.receive` + `engine.decide(kind: 'accept')`），worker 仍按 Trigger → Ticket → `worker-<ticket id>` 创建独立会话。
- 返回值不再用误导性的 `queued`：成功时给出真实 `ticket_id`，失败时给出 `duplicate` / `filtered` 及原因，模型不会再编造"排队中"。

### Changed

- `src/chat-router/tools.ts` 的 `ChatRouterToolsHost.submit` 返回 `DispatchedTask`（`ticketId?` + `triggerId` + `result`）；`src/app/runtime.ts` 新增 `dispatchChatTask`，以 `source: inbox` / `actor: local` / `addressed: direct` 的 explicit Trigger 走既有准入（收件白名单含 `local`），不写文件、不等轮询。

### Notes

- 简报回投仍走 `done/*.reply.md` 轮询；直接建单不再产生 inbox 文件，所以本轮简报回投暂不生效，请用 `chat_status` 查看工单状态（阶段、标题）。后续版本改为事件驱动。
- 已知限制不变：`chat_answer` 仍以 `engine.note` 简化；`worker.maxParallel` 未接执行器槽位；面板仍无任务列表/工作台视图。

## [0.2.0] — 2026-11-09

### Added

- **主对话总管模式（chatRouter，默认关闭）**：新建的普通 DSH 主对话可被剥夺命令、文件写入与子代理等执行工具，只保留派发/状态/只读工具；`forceDispatch` 的 guard 会拒绝越界调用并提示改用 `chat_dispatch`。每个新建主对话独立成为总管，不绑定固定 session id，彼此只共享工单库、不共享对话上下文。
- 派发链路：`chat_dispatch` 把任务写成普通本地收件目录 `.md`（与面板「派一张单」同一条路径）→ Trigger → Ticket → `worker-<ticket id>` **平级独立会话**（独立 cwd / workspace，不是 DSH `subagent`）；worker 结果以限长简报回投发起派发的主对话，完整 transcript 留在 worker。
- 插件面板新增「总管模式」设置分组：总开关、三档工具预设（`strict` / `standard` / `custom`）、自定义逐工具矩阵、强制派发、结果回传、并行工单数；`chatRouter` 同步进入声明式设置块与自动生成的 JSON Schema。

### Changed

- `src/app/sessions.ts` 新增 `decorateChatRouter()`，`src/app/runtime.ts` 注册 host 与简报轮询；既有 Router / Worker / Watchdog 会话行为不变。
- `docs/007-architecture.md` 模块表与测试表、`tests/panel-settings.spec.tsx`、`tests/policy.spec.ts`、`tests/fixtures/panel-server.ts` 同步；新增 `tests/chat-router.spec.ts`（13 例）与 `docs/027-chat-router.md`。

### Notes

- 默认关闭，存量部署零影响；仅对**新建会话**生效，已运行会话沿用创建时的工具白名单。
- 需要启用本地收件目录 Source 才能派单；建单与简报回投目前走 10s / 5s 轮询而非事件驱动。
- `chat_answer` 当前以 `engine.note` 简化，`worker.maxParallel` 尚未接到执行器槽位；真机端到端验收待做。详见 `docs/027-chat-router.md` §7。
- 本版本之前本地误留的 `v0.4.0` tag 与 `dist/` 产物已删除；0.4.0 从未发布到 npm、也没有 GitHub Release。

## [0.1.5] — 2026-11-09

### Changed

- `stateDir` 由必填改为**可选**：未配置时插件按 profile 派生 `<DSH home>/state/<profile>-superagent`（名为 `superagent` 的 profile 与无 profile 上下文沿用历史的 `state/superagent`）；显式配置始终优先，既有部署的数据目录不会移动。「一个 `stateDir` 只允许一个后端」的锁隔离语义原样保留。这消除了新装用户跳过配置步骤时的**静默失败**陷阱（该 entry 非必需、启动审计只警告、桌面端 host 的 stderr 被 Electron 吞进缓冲，用户只见「没有响应」）。
- README（中英）、`docs/006-deployment.md`、`docs/WINDOWS-SETUP.md`、`examples/profile.cordis.patch.yml` 同步改为「可选覆盖 + 派生默认」。
- 新增派生规则测试：`tests/deployment.spec.ts`（`defaultStateDir` 与 `machineOf` 回退、`DSH_HOME` 语义）、`tests/index.spec.ts`（`apply` 按 `profileContext` 派生并记日志）。

## [0.1.4] — 2026-11-09

### Fixed

- 状态目录锁回收（PR #18，已合并）：`Runtime` 在注册 HTTP 之前先对 `stateDir` 加锁，持锁者进程已死时立即回收（`src/app/state-lock.ts`），修复桌面端 `/orchestrator/api/state` 404 与面板「没有响应」的静默失败。新增 `tests/state-lock.spec.ts`。

### Changed

- 模式选择器中两个插件 preset 的显示名去掉「[内部]」前缀：`dsh-superagent 执行器`、`dsh-superagent 主 Session`（`cordis.patch.yml`）。DSH 的 preset 行没有从选择器隐藏的设置，名字不是功能开关；两个 preset 分别被执行器 Session 与主 Session 按 id 引用，用途警示继续由 description 承担。

## [0.1.3] — 2026-11-08

缺陷修复版。0.1.2 在 DeepSeek Harness 桌面端（DSH 0.2.2-rc.1）启动直接失败：`lib/client.js` 的客户端模块注册 id 仍是裸名 `dsh-superagent`，而桌面端按 scoped 包名组合客户端模块，报 `duplicate factory registration for "dsh-superagent"` 与 `1 entry did not activate @reserendipity/dsh-superagent: import failed`。CLI 宿主（0.2.1）容忍这种不一致，所以此前都只在 CLI 或一次性验证里通过。

### Fixed

- `lib/client.js` 的客户端模块注册 id 改为 `@reserendipity/dsh-superagent`；该 id 由 `tsdown.config.ts` 从 `package.json` 的 `name` 派生，不再手写，避免与包名再次漂移。
- 新增 `tests/client-module-id.spec.ts`：断言构建后的客户端注册 id 与 `package.json` 的 `name` 一致，CI 上会拦截回归。

### Docs

- README（中英文）与 CONTRIBUTING 说明 pnpm 的 `minimumReleaseAge` 策略：pnpm 11 起默认开启（默认 1 天），刚发布的版本在成熟前不会被裸包名解析到，需要显式写版本号才能装到。

## [0.1.2] — 2026-11-08

文档修正版，无功能变更。README 里写死「当前 0.1.0」的表述改为版本无关（npm 上已发布的最新版本 / 自 v0.1.0 起建立公开基线），其余文档同步去掉会随下次发版失效的版本锚点。

### Changed

- README（中英文）：安装段的「当前版本」改为「npm 上已发布的最新版本」/「the latest published version on npm」；「公开基线 v0.1.0」改为「自 v0.1.0 起（建立）公开基线」。
- docs/WINDOWS-SETUP.md、docs/WINDOWS-DELTA.md：同一批「公开基线为 0.1.0」改为「自 0.1.0 起为公开基线」。

### Notes

- 无代码、无 `lib/` 变更；功能与 0.1.1 相同。

## [0.1.1] — 2026-11-08

文档修正版，无功能变更。0.1.0 的 npm tarball 内含发布前写的 README（安装段只有 Git 地址、并标注 npm 尚未发布），npm 页面因此显示过期信息；本版只更新文档并重新打包。

### Changed

- README：安装段以 `dsh plugin add "@reserendipity/dsh-superagent"` 为主、Git 地址为备选；发布状态与英文 Honest limits 改为已发布；FAQ 只描述当前包名。
- CONTRIBUTING / CHANGELOG：发布后验证改为比对内容而非字节（npm 打包器与 `pnpm pack` 产出的 tarball 字节不同）。

### Notes

- 无代码、无 `lib/` 变更；功能与 0.1.0 相同。

## [0.1.0] — 2026-11-08

首个公开基线。此前内部迭代的版本记录已随公开基线归档，不再列入本文件。

### Added

- 事件源：GitHub issue / PR / 评论 / CI 结果，本机收件目录，可选飞书群聊。
- 准入与评估：程序层准入（谁能触发、什么算请求）+ 语义层评估；含糊消息交模型，必要时反问。
- 执行：每张工单一个上下文隔离的 DSH 会话，独立工作目录；完成后回贴评论或开 PR；Watchdog 控制回路与 Router 分片按需开启。
- 面板：介绍 / 概览 / 来源 / 评估 / 执行 / 设置；运行判读对应 CLI 退出码；首次打开给三步卡。
- 交付形态：GitHub 派单与本地收件目录；`mode: local` 下 `executor.prepare` 为空时自动建立内置本地工作区（`git init`、基座提交、`agent/<工单短名>` 分支，无远端）。
- 多实例：一个 `stateDir` 只允许一个后端（锁保护）；多 profile / 多 `stateDir` 各自独立。
- 配置：保存即生效的热加载；声明式设置文件；JSON Schema；提示词覆盖层与团队提示词默认值。
- 分发：已发布 npm 包 `@reserendipity/dsh-superagent`；仓库自带 `lib/` 构建产物，同时支持 `git+https` 安装；tarball 由 `pnpm pack:plugin` 产出。

### Notes

- 插件，非官方产品；上游归属与许可见 [NOTICE](NOTICE) 与 [LICENSE](LICENSE)。
- 当前支持 Windows 10/11；macOS / Linux 尚未验证。
- 安装后必须为 profile 配置 `stateDir`（无默认值，避免两个 profile 抢同一把锁）。
- npm 已发布 `@reserendipity/dsh-superagent@0.1.0`；按名字安装与 Git 地址安装并存。npm 包与 Release tarball 内容一致，但由不同打包器生成，字节不同。
