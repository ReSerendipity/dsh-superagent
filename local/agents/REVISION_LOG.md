# REVISION_LOG（自进化修订记录）

> 本文件由自进化协议维护：每次更新根 `AGENTS.md` 后追加一行，不删不改历史行。
> 路径优先 `local/agents/REVISION_LOG.md`；存量 `docs/agents/REVISION_LOG.md` 视为历史分片。
> 顶部「自进化版本」必须与最后一行版本对应；有 `scripts/check_revision_log.py` 的仓继续用机械闸。

| 自进化版本 | 日期 | 触发原因 | 更新内容摘要 | 对应项目版本 | 已校验 |
| :---: | ---------- | --- | --- | :---: | :-: |
| v1.0 | 2026-11-07 | 初始化台账 | 建立 GOTCHAS / REVISION_LOG 标准表头，填入本轮 7 条坑（含失败签名） | 0.4.0 | — |
| v1.1 | 2026-11-07 | 研读 ReSerendipity/.github 治理规范（§7/§13.1） | 建根 AGENTS.md（本地、契约 v2 内联）；docs/agent-contract.md 逐字节副本；.gitignore 补 `/local/` 与 `AGENTS.md`；登记本仓未入治理台账、推送逐次授权的 owner 口径 | 0.4.0 | 本地自检 |
| v1.2 | 2026-11-12 | 仓规事实陈述与现状对账（仓库转 public、治理台账已登记、三平台 CI 与 ruleset 上线、v0.2.7 已发布） | 更正根 AGENTS.md §0 定位与台账登记、§2/§5 的 local/ 例外（ADR-0019）、§3 public / tag / Release 口径、§5 CI 与 ruleset 现状；同步 ARCHITECTURE.md 治理定位行、.githooks/pre-push 注释与 §7 索引日期；授权规则（DCO、推送逐次授权、禁改平台设置）原样保留 | 0.2.7 | 本地自检 |
