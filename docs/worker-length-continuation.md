# Optional bounded length continuation

Set `executor.lengthContinuations` to 1 or 2 in executor settings (default 0). An explicit DSH `turn/end` reason of `max-tokens` can then queue another turn in the same worker session, assignment and workspace. Model, effort and per-call output limits are unchanged. A normal completed, blocked, cancelled or failed turn does not trigger this mechanism.

The assignment budget and event sequence are persisted atomically with a durable effect. Replaying an event cannot increase its budget. Session prompt IDs make retries idempotent. Effects respect pause, shutdown and worker slots. Superseding ticket inputs, a ready report, a pending human question, a stopped/replaced assignment or already queued session input suppress continuation. After the configured budget, ordinary idle/status handling applies.

This is recovery from an explicit length stop, not an independent correctness check or a guarantee that the model will not rerun work. The continuation instruction asks it to inspect saved artifacts and avoid repeating completed work. Existing host-restart assignment reconciliation still applies: this feature does not restore a cancelled assignment across a full process restart or increase its budget.
