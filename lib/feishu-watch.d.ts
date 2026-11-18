/** Feishu source kind definition, policy synchronization, and Cordis plugin entry. */
import { S as $strip, _ as output, b as $loose, c as ZodObject, f as ZodString, h as ZodURL, i as ZodEnum, l as ZodOptional, n as ZodBoolean, r as ZodDefault, s as ZodNumber, t as ZodArray, x as $strict } from "./schemas-2-UC6LY4.js";
import { _ as Tally, g as SourceRegistry, n as SourceKind, r as SourceContext } from "./kind-CGceQI49.js";
import { F as Thread, U as Trigger } from "./intake-HLlhGfwc.js";
import { Context } from "@deepseek-ai/cordis";
/** Retained source message reference anchoring context reads; `at` is the timestamp around which `chatAround` queries. */
interface FeishuRef {
  triggerId: string;
  chatId: string;
  messageId: string;
  at?: string;
}
export declare const SOURCE = "feishu";
/** A message as the live event consumer prints it; the history and topic-page paths normalize what they read into this shape. */
declare const EventSchema: ZodObject<{
  message_id: ZodString;
  chat_id: ZodString;
  chat_type: ZodEnum<{
    group: "group";
    p2p: "p2p";
  }>;
  sender_id: ZodString;
  sender_type: ZodEnum<{
    bot: "bot";
    user: "user";
  }>;
  content: ZodString;
  create_time: ZodString;
  mentions: ZodDefault<ZodArray<ZodObject<{
    id: ZodString;
    key: ZodOptional<ZodString>;
    name: ZodOptional<ZodString>;
  }, $strip>>>;
  root_id: ZodOptional<ZodString>;
  parent_id: ZodOptional<ZodString>;
  thread_id: ZodOptional<ZodString>;
  message_app_link: ZodOptional<ZodURL>;
}, $strip>;
type FeishuEvent = output<typeof EventSchema>;
export declare const feishuThreadId: (chatId: string, rootId: string | undefined, messageId: string) => string;
/** Deterministic trigger ID for a Feishu message; every read path for this message produces the same ID. */
export declare const feishuTriggerId: (messageId: string) => string;
export declare const withMentionNames: (text: string, mentions: {
  key?: string | undefined;
  name?: string | undefined;
}[]) => string;
/**
 * Parses a Feishu message timestamp into an ISO-8601 string: live events and the history API return epoch milliseconds as a
 * string, whereas topic/thread pages return a local timestamp string such as `2026-09-11 12:00`, read in the host's own
 * time zone - the zone the topic page rendered it in for this machine. Epoch values are exact everywhere; only the
 * topic-page string carries the zone ambiguity, and no client-side signal can resolve it.
 */
export declare function feishuTime(value: string): string;
/** Converts a normalized Feishu event into a Trigger, returning undefined for messages sent by the bot itself. */
export declare function feishuTrigger(input: unknown, botId: string, botAppId: string): Trigger | undefined;
export declare function feishuRef(trigger: Trigger): FeishuRef | undefined;
/** A message from the history API; a deleted message may have no body/content. */
declare const HistoricalMessageSchema: ZodObject<{
  message_id: ZodString;
  chat_id: ZodString;
  create_time: ZodString;
  root_id: ZodOptional<ZodString>;
  parent_id: ZodOptional<ZodString>;
  thread_id: ZodOptional<ZodString>;
  deleted: ZodOptional<ZodBoolean>;
  message_app_link: ZodOptional<ZodString>;
  sender: ZodObject<{
    id: ZodDefault<ZodString>;
    sender_type: ZodString;
  }, $loose>;
  body: ZodOptional<ZodObject<{
    content: ZodString;
  }, $loose>>;
  mentions: ZodOptional<ZodArray<ZodObject<{
    id: ZodString;
    key: ZodOptional<ZodString>;
    name: ZodOptional<ZodString>;
  }, $loose>>>;
}, $loose>;
type HistoricalMessage = output<typeof HistoricalMessageSchema>;
export declare function historyEvent(message: HistoricalMessage, chatId: string, direct: boolean): unknown;
/** Wait before restarting the event consumer: 1s after a run that stayed up for a minute, otherwise exponential backoff up to 60s. */
export declare const consumerRetry: (previous: number | undefined, ranMs: number) => number;
/** Refreshes the map of joined chats (`chat_id -> name`); throws on failure so the previously stored list remains intact. */
export declare function refreshChatNames(ctx: SourceContext, signal?: AbortSignal): Promise<Record<string, string>>;
/**
 * Backfills chat messages and active topic replies between `since` and `until` before the caller advances the chat cursor.
 * Topics are stored as `{ id: lastSeenAt }`, and unsubscribed topics older than the polling horizon are pruned.
 */
export declare function backfillChat(ctx: SourceContext, chatId: string, direct: boolean, since: string, until: string, signal: AbortSignal, tally?: Tally): Promise<void>;
/** Resolves the retained source message reference for polling a subscribed thread. */
export declare function threadRef(ctx: SourceContext, thread: Thread): FeishuRef | undefined;
/** Polls subscribed Feishu threads within the polling horizon so replies missed by the live stream become triggers. */
export declare function pollThreads(ctx: SourceContext, signal?: AbortSignal, tally?: Tally): Promise<void>;
declare const FeishuConfigSchema: ZodObject<{
  cli: ZodDefault<ZodString>;
  readPageSize: ZodDefault<ZodNumber>;
  linkTimeoutMs: ZodDefault<ZodNumber>;
  chats: ZodDefault<ZodArray<ZodObject<{
    chatId: ZodString;
    name: ZodOptional<ZodString>;
    listen: ZodEnum<{
      all: "all";
      mentions: "mentions";
    }>;
  }, $strict>>>;
  directMessages: ZodDefault<ZodBoolean>;
  otherChats: ZodDefault<ZodEnum<{
    mentions: "mentions";
    none: "none";
  }>>;
}, $strict>;
export type FeishuConfig = output<typeof FeishuConfigSchema>;
export declare const feishuKind: SourceKind<FeishuConfig>;
/** Returns the Feishu Source's settings, falling back to schema defaults while the Feishu plugin is disabled. */
export declare const feishuSettings: (sources: SourceRegistry) => FeishuConfig;
export declare const name = "dsh-superagent-feishu";
export declare const inject: string[];
export declare function apply(ctx: Context): void;
export type { FeishuEvent };