import { S as $strict, c as ZodNumber, i as ZodDefault, l as ZodObject, p as ZodString, v as output } from "./schemas-C2t1ehgZ.js";
import { U as Trigger, l as OutboundMessage } from "./intake-OhnAYFN6.js";
import { n as SourceKind, r as SourceContext, t as DeliveredMessage } from "./kind-kG9dyom5.js";
import { Context } from "@deepseek-ai/cordis";
//#region src/sources/inbox.d.ts
/**
 * A pending file younger than this may still be being written (a cloud-sync drop, a slow copy): taking it in would
 * ingest a truncated request and, once the writer closes, re-offer the whole file as a second request. The poll skips
 * such a file this round and reads it whole on the next one, so the grace costs one polling interval at most.
 */
declare const INBOX_STABILITY_MS = 2000;
declare const InboxConfigSchema: ZodObject<{
  inboxDir: ZodDefault<ZodString>;
  actor: ZodDefault<ZodString>;
  pollSeconds: ZodDefault<ZodNumber>;
}, $strict>;
type InboxConfig = output<typeof InboxConfigSchema>;
/** The inbox root: the configured absolute directory, or `<stateDir>/inbox` when unset. */
declare function inboxDir(deployment: {
  stateDir: string;
}, config: InboxConfig): string;
/** One pending task file as the poll sees it. */
interface InboxFile {
  path: string;
  relPath: string;
  content: string;
  mtimeMs: number;
}
/** The Trigger of one task file; unchanged replays share one id, edits and re-drops do not. */
declare function inboxTrigger(file: InboxFile, config: InboxConfig, root: string): Trigger;
/**
 * Renders the Thread's reply file from the pipeline's own receipts, oldest delivery first. Content that no receipt backs -
 * a block a worker wrote straight into the file - is therefore gone after the next delivery, which is the point: the file
 * is the delivery record, and only the Channel delivers. Without `delivered` (a caller outside the pipeline) the single
 * message is appended once, keyed by its id, as before.
 */
declare function sendInbox(_host: Pick<SourceContext, 'commands'>, message: OutboundMessage, delivered?: readonly DeliveredMessage[]): Promise<'sent' | 'gone'>;
declare const inboxKind: SourceKind<InboxConfig>;
/** Read pending files in the inbox once they have settled, take in each, and archive it under done/. The move is the cursor. */
declare function pollInbox(ctx: SourceContext, config: InboxConfig, signal: AbortSignal): Promise<{
  read: number;
  moved: number;
  failed: number;
  lastError?: string;
}>;
declare const name = "dsh-superagent-inbox";
declare const inject: string[];
declare function apply(ctx: Context): void;
//#endregion
export { INBOX_STABILITY_MS, InboxConfig, InboxFile, apply, inboxDir, inboxKind, inboxTrigger, inject, name, pollInbox, sendInbox };