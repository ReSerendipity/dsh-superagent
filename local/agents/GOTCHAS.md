# GOTCHAS（坑点台账）

> 本文件由自进化协议维护：每次踩坑 / 修 bug 后追加到表尾，不删不改历史行。
> 路径优先 `local/agents/GOTCHAS.md`；存量 `docs/agents/GOTCHAS.md` 视为历史分片。
> 不得写密钥 / token / 口令 / 连接串；限制级内容只写指路，不摘正文。

| # | 坑点标题 | 触发场景 | 现象/报错 | 正确做法 | 首次发现日期 |
|---|---|---|---|---|---|
| 1 | link: 目录安装不带依赖 [sig:link-install-missing-deps] | 官方应用插件页填本地目录装插件 | 启用报 `ERR_MODULE_NOT_FOUND: Cannot find package 'proper-lockfile'`（补后又报 `zod`）；组件 pending | pnpm 不给 `link:` 被链目录装依赖；产物须自包含（tsdown `deps.alwaysBundle`）或先在该目录 `pnpm install`；见 docs/021 §2.11–§2.12 | 2026-11-06 |
| 2 | pnpm 清旧 link: 顺符号链接删进目标 [sig:pnpm-prune-through-symlink] | 卸载 link: 安装后重装 | 临时目录里的 `node_modules` 整体消失，而应用仍按旧链接启用 | 别把 `link:` 目标当可丢弃介质；卸载后先回读 `node_modules/<pkg>` 是符号链接还是真目录再动 | 2026-11-06 |
| 3 | 保存/放弃同行坐标点错 [sig:panel-save-discard-misclick] | 目视后想点「放弃修改」 | 点到「保存」，把预设写进了用户改过的提示词（revision +1） | 成对破坏性按钮用元素索引或先滚动定位再取索引；误写立即用开工前快照 PUT 还原并逐字节回读 | 2026-11-07 |
| 4 | launch_app 返回≠应用起来 [sig:launch-app-no-window] | 脚本化重启桌面应用 | 进程在但无窗口、无监听端口；或随后自行退出 | 以「端口可 curl + 进程数 + 窗口枚举」三者判定起来；退出走菜单「应用 → 退出」，关窗口会进托盘 | 2026-11-06 |
| 5 | 手抄 node 内置模块表漏项 [sig:handcopied-builtin-list] | 写产物外部依赖白名单测试 | 守卫测试误红：`node:sqlite` 不在手抄表里 | 从 `node:module.builtinModules` 派生集合，不手抄；并加正反控防空过 | 2026-11-07 |
| 6 | 跨回合元素索引/窗口状态失效 [sig:stale-element-index] | 新回合继续用上一回合的 element_index | `call get_window_state before using this window` / `window is minimized` | 每回合先 activate + get_window_state 再动作；坐标以当次截图为准，别沿用旧图读数 | 2026-11-07 |
| 7 | README 把退役路线写成当前能力 [sig:readme-stale-route] | 路线从便携外壳改为寄住官方应用后 | README 仍写双击即用/内置工具链/`install.ps1` 一行装；并假称插件页收 `.tgz` 路径 | 实测证伪后改框架：当前路线领头、外壳降为标注的历史路线；无 Release 时明说一行命令会失败 | 2026-11-07 |
| 8 | 后台窗口的合成点击被 webview 吞掉 [sig:background-webview-swallow-click] | 官方 DeepSeek Harness 应用在后台时驱动插件页（UIA Invoke 与 event 策略都试过） | 动作返回成功但界面逐字节不变；同一元素前台时正常 | 先把窗口带到前台再点，或改走键盘（菜单箭头 + Enter 在后台可落地）；原生菜单项用「展开 → 方向键走到目标（逐步读焦点校验）→ Enter」可靠 | 2026-11-07 |
| 9 | 强杀后端留 stale 锁目录 [sig:hardkill-stale-lock-dir] | taskkill /F 杀掉 dsh 后端再立即重启 | 插件启用报 `Error: Lock file is already being held`（Windows 上是 `.lock` **目录**），重启多次不消 | 重启前确认进程全退并删 `<stateDir>.lock` 目录；锁是 proper-lockfile 目录锁，强杀不会自动释放 | 2026-11-07 |
| 10 | 源 cli 指向 .cmd 被 Node spawn 拒绝 [sig:cmd-cli-einval] | 声明式配置把 `sources.github.config.cli` 指到 `.cmd` 包装器 | 轮询报 `gh-agent.cmd could not run: EINVAL`（Node ≥20 直接 spawn .bat/.cmd 不带 shell 即 EINVAL） | cli 用裸 `.exe`；gh 的凭据目录靠后端进程环境 `GH_CONFIG_DIR` 注入（指向 stateDir 的 `gh-config` 副本），不用包装器改环境 | 2026-11-07 |
| 11 | 全量并发跑时 service-script 用例偶发红 [sig:service-script-suite-flaky] | `pnpm vitest run` 全量（75 文件并发） | `service-script-windows.spec.ts` 的 stop 记录用例偶发失败；单跑该文件 4/4 绿 | 全量红先单跑该文件复核再定性；不要只凭全量结果判定回归 | 2026-11-07 |
| 12 | worktree 里 node_modules 用 junction 会让 CI「lib 与 fresh build 一致」失败 [sig:worktree-junction-lib-drift] | 在 git worktree 里 build 并发布（node_modules 用 junction 指向主 checkout） | CI 报 `lib/ is stale - rebuild and commit it`；CI 重建的 chunk 名与本地不同（rolldown 经 junction 解析到另一套绝对路径，chunk hash 随之变化），而本地工具链与 CI 完全一致 | worktree 内先 `cmd /c rmdir node_modules` 只删链接，再 `pnpm install --frozen-lockfile` 独立安装，然后 `pnpm build`；产物名应与 CI 日志里 `??` 的文件逐个吻合后再提交 | 2026-11-09 |
| 13 | 台账被父目录级 ignore 挡住，`!` 反包含写了不生效 | 本仓 `.gitignore` 原为 `/local/`，按 ledger-gate 要求往台账补行后执行 `git add` | `git check-ignore -v` 仍命中 `/local/`，`git add -n` 报 paths are ignored；台账长期只存在于本机，远端无该文件 | 按 ADR-0019 改四段式：`/local/*` → `!/local/agents/` → `/local/agents/*` → `!/local/agents/GOTCHAS.md` → `!/local/agents/REVISION_LOG.md`；验收以 `git add -n` 成功为准，且同目录 `.ledger-baseline.json` 等内部件必须仍被忽略 | 2026-11-12 |
