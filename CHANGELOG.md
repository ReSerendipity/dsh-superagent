# DSH-Superagent Changelog

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
