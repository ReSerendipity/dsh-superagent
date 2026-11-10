# 027 主对话总管模式（chatRouter）

> 依据：官方《Super-agent 设计探索》§2 的 Router/Worker 分层，与 TRAE 宝「全局助理 + 独立执行会话」的产品形态；本仓 2026-11-09 需求。
> 与 `docs/011` 的关系：这篇文章的一致性审查针对插件自己的 Router 主 Session；本文是一个**新增的、作用于普通 DSH 主对话**的可选功能，不改既有 Router 语义。
> 现状（0.2.7）：端到端 MVP 5/5 通过——派发建新单 → 独立 worker → 真实执行 → 右栏可见 → 完成回投。

## 1. 它解决什么

插件原本的输入只有 GitHub / 本地收件目录 `.md` / 面板「派一张单」。普通聊天窗口里说一句「帮我做 X」，插件不接管（`src/app/sessions.ts` 的 `decorate()` 对非 Router、非 Worker 的会话直接返回），于是那个会话用自己全套工具把活干了——上下文与执行混在一个窗口里。

总管模式把**每一个新建的普通主对话**变成一个只负责派发的「总管」：

- 工具按档位剥夺，命令 / 文件写入 / 子代理一律不可见；
- 任务通过 `chat_dispatch` **直接交给 Engine**（`engine.receive` + `engine.decide`），走既有 Trigger → Ticket → `worker-<ticket id>` 链路，不经过 Router 会话；
- worker 是**平级独立 Session**，有独立 session id、cwd 与 workspace，不是 DSH `subagent` 父子会话；
- 只有限长简报回投发起派发的那个主对话，完整 transcript 留在 worker。

**与 TRAE 宝的差异**：TRAE 宝的全局助理对话框唯一、不能新建；本功能按需求**允许新建多个主对话**，每个都是独立总管。它们共享 `orchestrator.sqlite` 的工单与产物，但看不到彼此的对话内容。

## 2. 开关与档位（插件面板）

设置 → **总管模式**（`SETTINGS_GROUPS` 的 `chatRouter` 分组，实现在 `src/client/chat-router.tsx`）：

| 控件 | 字段 | 默认 |
|---|---|---|
| 启用总管模式 | `enabled` | `false`（存量部署零影响） |
| 主对话工具档位 | `tools.preset` | `standard` |
| 自定义工具矩阵（`custom` 时展开） | `tools.allow` | `[]` |
| 强制派发 | `forceDispatch` | `true` |
| 结果回传 | `reply.mode` | `brief` |
| 并行工单数 | `worker.maxParallel` | `3` |

三档：

| 档位 | 主对话保留的工具 |
|---|---|
| `strict` | 仅 `chat_dispatch` / `chat_status` / `chat_answer`（零执行工具，对应官方文章最严口径） |
| `standard` | 上述三项 + `orchestrator_read` / `read` / `read_image` / `glob` / `grep` / `skill` |
| `custom` | 上述三项 + 面板逐项勾选的工具（按只读 / 命令 / 写入 / 网络 / 子代理等分组） |

保存走既有 `PUT settings/:block` 与乐观并发 revision；`chatRouter` 已加入 `DECLARATIVE_BLOCK_NAMES`，声明式文件可覆盖，JSON Schema 由 `SettingsSchema` 自动生成。

## 3. 前置条件与生效时机

- **不需要 inbox Source**：`chat_dispatch` 直接构造 explicit Trigger 交给 Engine（`engine.receive` + `engine.decide(kind: 'accept')`），不写任务文件、不等轮询。0.2.1 之前写 inbox 文件的路径已废弃（Router 会话不可用时派发会静默失败）。
- **只对新建会话生效**：`tools.restrict` 在会话 decorate 时注册，已运行的对话沿用创建时的白名单（与 DSH「Sessions retain the preset selected at creation」一致）。关闭开关后，新建对话恢复原工具集。面板文案已明示这一点。
- 插件自己的 Router（`orchestrator-*`）、执行器（`worker-*`）、Watchdog（`watchdog-*`）会话以及任何子代理，**永远不被接管**。

## 4. 派发与回投（0.2.7 的链路）

```
主对话（总管） ──chat_dispatch──▶ Runtime.dispatchChatTask
                                    │
                                    ├─ engine.receive(trigger)          ← 每次派发一个独立 Thread
                                    ├─ engine.decide(accept, name)      ← name 缺失时兜底 task-<base36>
                                    └─ chatTickets.set(ticketId, chatSessionId)
                                    
worker-<ticket id> 独立会话执行 ──ticket.ended──▶ Runtime.reportToChat
                                                    │
                                                    └─ sessions.prompt(chatSession, 'chat-brief:<id>', text, 'queue')
```

三个关键约束（都是真实缺陷修出来的）：

| 约束 | 不满足时的症状 |
|---|---|
| **Thread 每次派发唯一**（`key('chat-thread', sessionId, at)`） | Intake 把新请求挂到该 Thread 的既有工单（即使已 completed），不建新单、旧单被翻活、`outcome` 被覆盖 |
| **accept 必须带合法 `name`** | `ticketWorktreeName("")` 抛 `WorktreeNameSchema`，工单建不出来（1–4 个 kebab-case 英文词，≤32 字符） |
| **回投用 `queue` 而非 `steer`** | `steer` 只送达运行中的回合；主对话派完单即空闲，简报被静默丢弃 |

## 5. 右栏任务面板

DSH 的右侧栏标签由两个座位组成，缺一不可：

| 座位 | 作用 |
|---|---|
| `ctx.get('sidebarRightTabs').register({ id, kind, priority, title, guide })` | 注册**标签类型**（侧栏列表里显示什么） |
| `ctx.slots.inject('sidebar.right.pane.tab', …)` + `register({ name, key: TAB_ID, order }, Panel)` | 注册**正文**；`key` 必须等于标签类型的 `id` |

**用 `id` 而不是 `key` 注册正文，侧栏会查不到内容，落到空状态**（这是 0.2.5/0.2.6 反复失败的根因）。宿主没有 `sidebarRightTabs` 时只 `console.warn`，不阻塞启动。

面板能力：

- 卡片式：标题、状态徽章（completed 绿 / working 蓝 / stopped 红 / person 橙）、摘要两行截断与点击展开、结束时间、「来自 xxxxxxxx」、「打开会话」；
- 搜索（标题/摘要）、状态筛选（全部 / 进行中 / 已完成）、手动刷新（`⟳` + 刷新时间）、5 秒自动轮询；
- 右键菜单：打开会话 / 重试 / 停止；
- 「来自 xxxxxxxx」点击跳回发起派发的主对话；
- `report_state` 显示 worker 最近一次报告状态（progress / waiting / ready / blocked / failed / dropped）。

## 6. 实现坐标

| 位置 | 职责 |
|---|---|
| `src/chat-router/config.ts` | schema、三档预设、`allowedChatTools()`、`briefOf()` |
| `src/chat-router/tool-groups.ts` | 面板自定义矩阵的工具分组（无 zod，供客户端复用） |
| `src/chat-router/match.ts` | 普通会话判据；不绑定固定 session id |
| `src/chat-router/tools.ts` | `chat_dispatch` / `chat_status` / `chat_answer`；`TaskSchema` 含可选 `name` |
| `src/chat-router/host.ts` | Runtime 与 `Sessions` 之间的接缝、总管提示词 |
| `src/app/runtime.ts` | `dispatchChatTask()`（直接建单）、`reportToChat()`（工单结束回投）、`chatTickets` 映射 |
| `src/app/views/tickets.ts` | `chatRouterTasks()`：工单列表 + `chat_session` + `worker_session` + `dispatched` + `report_state` |
| `src/app/http.ts` / `api.ts` | 只读路由 `GET chatRouter/tasks` |
| `src/app/sessions.ts` | `decorateChatRouter()`：注入提示词段、注册工具、`tools.restrict` + `tools.guard` |
| `src/client/tasks-pane.tsx` | 右栏面板（自带 `<style>`，不依赖面板 CSS） |
| `src/client/index.tsx` | 标签类型 + 正文注册、`sidebar.panellist` 图标 |
| `src/client/chat-router.tsx` / `route.ts` / `settings.tsx` / `locales.ts` | 面板分组、控件、中英文案 |
| `prompts/chat-router.md` / `tests/chat-router.spec.ts` | 提示词资产 / 契约测试 |

**强制派发是硬约束**：白名单之外工具不可见；`forceDispatch` 再加一层 guard，任何越界调用被拒并提示改用 `chat_dispatch`。提示词只是软约束。注意 `tools.restrict` 只约束从 preset 继承的工具，本地注册的三个派发工具不受影响（与上游 `MASTER_TOOLS` 同一机制）。

## 7. 上下文隔离（对应需求的核心）

```
主对话 A（总管，工具被剥夺） ──chat_dispatch──▶ Ticket A ──▶ worker-<A> 独立会话
主对话 B（总管，工具被剥夺） ──chat_dispatch──▶ Ticket B ──▶ worker-<B> 独立会话
        ▲                                                          │
        └──────────── 限长简报（不含工具输出 / transcript）◀─────────┘
```

- 每个主对话派发的工单挂在**独立的 Thread** 上，互不干涉；
- `chat_status` 与右栏都读**共享工单库**，不是别的主对话的上下文；
- 简报由 `briefOf()` 限长（默认 400 字符），worker 的完整输出、文件内容、工具结果都不进入主对话。

## 8. 验收（0.2.7 实测）

| # | 环节 | 结果 |
|---|---|---|
| 1 | 派发建新单 | ✓ 10 秒返回新 `ticket_id`，tickets 10→11 |
| 2 | 独立工单与 worker | ✓ `work/task-…` + `sessions/…` + 左侧工作区，三者齐新增 |
| 3 | worker 真实执行 | ✓ 目标文件落盘 |
| 4 | 右栏可见 | ✓ 新卡片 completed，标签「总管任务」正常 |
| 5 | 完成回投 | ✓ 主对话自动收到 `Task … ended (completed)` 简报并唤醒 |

另有契约测试：`pnpm typecheck` / `pnpm vitest run` / `pnpm build` 全绿；`lib/` 与 fresh build 一致。

## 9. 已知限制

- **停止/重试未做端到端验证**：本机 `local-qwen` 的 8081 被其他程序占用、`health.evals=error`，制造不出可停止的 working 窗口。菜单与 API（`POST tickets/:id/stop|retry`）已接。
- **标签 title 座位**：宿主在 `sidebar.right.pane.tab.title` 座位缺失时会固化开标签时捕获的标题；关闭重开标签即恢复。机制性隐患，待补 title 座位。
- **`worker.maxParallel` 是面板值**，实际并发仍受执行器 worker slot 限制。
- **主对话被剥夺工具后不能自己读文件/跑命令**；需要查证的一律由 worker 查完以简报回传，这是设计取舍。
- **面板「应用到当前会话」**（对已运行会话重新装饰）尚未实现，当前仅对新建会话生效。
- 历史遗留：2026-11-10 17:15–17:17 的孤儿触发器已清理（`triggers 33→24`，`tickets` 不变），备份在 `orchestrator.sqlite.bak-orphans-20261110`。

## 10. 与上游的关系

本功能是纯增量：不改 `src/core/**`（与上游逐字节相同），不改既有 Router/Worker 语义，默认关闭。若上游将来实现同名的「主对话工具治理」，按 `docs/WINDOWS-DELTA.md` 的差量清单删除本模块并切回上游。
