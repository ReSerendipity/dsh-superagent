# DSH-Superagent Changelog

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
