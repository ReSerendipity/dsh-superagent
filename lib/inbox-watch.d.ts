/**
 * Inbox source kind (Mode A, single operator): a local directory whose Markdown files become Triggers, so one GitHub
 * account is enough. Dropping `task.md` into the inbox is a direct request from the configured local actor; the reply
 * file `done/task.md.reply.md` next to the archived task file is rewritten from the delivery receipts on every send.
 * The archive move is the read cursor: a Trigger id
 * names file + mtime + content hash, so replaying an unchanged file is `duplicate` and editing or re-dropping makes a
 * new event. Nothing in this module depends on GitHub notifications, so it is unaffected by the agent-account filter.
 */
import { _ as output, c as ZodObject, f as ZodString, r as ZodDefault, s as ZodNumber, x as $strict } from "./schemas-2-UC6LY4.js";
import { U as Trigger, l as OutboundMessage } from "./intake-HLlhGfwc.js";
import { n as SourceKind, r as SourceContext, t as DeliveredMessage } from "./kind-CGceQI49.js";
import { Context } from "@deepseek-ai/cordis";
/**
 * A pending file younger than this may still be being written (a cloud-sync drop, a slow copy): taking it in would
 * ingest a truncated request and, once the writer closes, re-offer the whole file as a second request. The poll skips
 * such a file this round and reads it whole on the next one, so the grace costs one polling interval at most.
 */
export declare const INBOX_STABILITY_MS = 2000;
declare const InboxConfigSchema: ZodObject<{
  inboxDir: ZodDefault<ZodString>;
  actor: ZodDefault<ZodString>;
  pollSeconds: ZodDefault<ZodNumber>;
}, $strict>;
export type InboxConfig = output<typeof InboxConfigSchema>;
/** The inbox root: the configured absolute directory, or `<stateDir>/inbox` when unset. */
export declare function inboxDir(deployment: {
  stateDir: string;
}, config: InboxConfig): string;
/** One pending task file as the poll sees it. */
export interface InboxFile {
  path: string;
  relPath: string;
  content: string;
  mtimeMs: number;
}
/** The Trigger of one task file; unchanged replays share one id, edits and re-drops do not. */
export declare function inboxTrigger(file: InboxFile, config: InboxConfig, root: string): Trigger;
/**
 * Renders the Thread's reply file from the pipeline's own receipts, oldest delivery first. Content that no receipt backs -
 * a block a worker wrote straight into the file - is therefore gone after the next delivery, which is the point: the file
 * is the delivery record, and only the Channel delivers. Without `delivered` (a caller outside the pipeline) the single
 * message is appended once, keyed by its id, as before.
 */
export declare function sendInbox(_host: Pick<SourceContext, 'commands'>, message: OutboundMessage, delivered?: readonly DeliveredMessage[]): Promise<'sent' | 'gone'>;
export declare const inboxKind: SourceKind<InboxConfig>;
/** Read pending files in the inbox once they have settled, take in each, and archive it under done/. The move is the cursor. */
export declare function pollInbox(ctx: SourceContext, config: InboxConfig, signal: AbortSignal): Promise<{
  read: number;
  moved: number;
  failed: number;
  lastError?: string;
}>;
export declare const name = "dsh-superagent-inbox";
export declare const inject: string[];
export declare function apply(ctx: Context): void;
export {};