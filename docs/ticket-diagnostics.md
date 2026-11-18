# Minimal ticket diagnostic export

An operator can explicitly export workflow structure with `GET /orchestrator/api/tickets/<id>/diagnostic`. Use the existing loopback management server and send `x-orchestrator-request: 1`; all existing host/origin checks apply. No background collection, uploads, model calls, new permissions or task mutation are added.

The versioned JSON includes counts, boolean lifecycle facts, assignment/report states and truncated SHA-256 correlation IDs. It deliberately excludes prompts, reasoning, source text, report summaries, timestamps, account IDs, URLs, workspace paths, environment variables and configuration. New fields are not exported automatically. Inspect any bundle before sharing: workflow structure and counts can still be sensitive, and correlation hashes are not encryption or guaranteed anonymity.

This is a small diagnostic attachment for workflow bugs, not a full task replay archive. Reproducing coding quality or timing still requires an independently prepared public example and environment description. It cannot explain a model's reasoning or restore a task. Missing tickets return 404.
