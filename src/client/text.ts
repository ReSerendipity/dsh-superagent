/** Localization, reason formatting, message marker cleanup, and relative timestamp helpers. */
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import type { DshSuperagentKey } from './locales.ts'
import type { Localized } from '../sources/kind.ts'
import type { SetupProblem } from '../setup.ts'
import type { Health } from '../sources/host.ts'
import { reasonText, type Reason } from '../core/reasons.ts'

export type T = Translate<DshSuperagentKey>
export const errorText = (failure: unknown): string => failure instanceof Error ? failure.message : String(failure)
export const localized = (t: T, text: Localized | string | undefined): string =>
  typeof text === 'string' ? text : text ? text[t('lang') === 'en' ? 'en' : 'zh'] : ''
export const actorName = (t: T, actor: { name?: Localized } | undefined): string => actor?.name ? localized(t, actor.name)
  : t('automatedNotice')
export function valueLabel(t: T, group: string, key: string | undefined): string {
  if (!key) return ''
  const name = `${group}.${key}` as DshSuperagentKey
  const text = t(name)
  return text === name ? key : text
}
/** Format one or more structured or raw reasons in the active UI language, truncating multi-line host errors to their first line. */
export function reasonLabel(t: T, reason: string | Reason | readonly Reason[] | undefined): string {
  if (typeof reason === 'string') return reason ? label(t, { code: reason }) : ''
  return [reason ?? []].flat().map(item => label(t, item)).filter(Boolean).join(t('listSeparator'))
}
function label(t: T, reason: Reason): string {
  const key = `reason.${reason.code}` as DshSuperagentKey
  const text = reason.code === 'said' ? reason.values?.text ?? '' : t(key, reason.values)
  if (reason.code !== 'said' && text !== key) return text
  const written = reason.code === 'said' ? text : reasonText({ ...reason, triggerId: undefined })
  if (/^\w*Error\b/.test(written)) { const first = written.split('\n')[0]!; return first.length > 140 ? `${first.slice(0, 140)}…` : first }
  return written
}
export const setupText = (t: T, problem: Pick<SetupProblem, 'code' | 'values'>): string => t(`setup.${problem.code}`, problem.values)
export const healthText = (t: T, health: Pick<Health, 'detail' | 'code' | 'values'>): string =>
  health.code ? t(`healthCode.${health.code}` as const, health.values) : health.detail
/** Replaces Feishu and GitHub content placeholders (images, cards, media, forwards, unresolved mentions) with localized labels. */
export function readableMarkers(t: T, text: string): string {
  return text.replace(/!\[[^\]]*\]\([^)]*\)|\[Image: [^\]]*\]|\[image\]/g, t('imageMarker'))
    .replace(/\[Chat card: [^\]]*\]/g, t('cardMarker'))
    .replace(/\[Media: [^\]]*\]/g, t('mediaMarker')).replace(/\[Merged forward\]/g, t('forwardMarker'))
    .replace(/@_user_\d+/g, t('unknownMention'))
}
const timeLocale = (lang: string) => lang === 'en' ? 'en' : 'zh-CN'
export function when(value: string | undefined, lang: string): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const seconds = Math.round((date.getTime() - Date.now()) / 1000)
  if (Math.abs(seconds) < 86_400) {
    const relative = new Intl.RelativeTimeFormat(timeLocale(lang), { numeric: 'auto' })
    if (Math.abs(seconds) < 60) return relative.format(0, 'second')
    if (Math.abs(seconds) < 3600) return relative.format(Math.round(seconds / 60), 'minute')
    return relative.format(Math.round(seconds / 3600), 'hour')
  }
  const sameYear = date.getFullYear() === new Date().getFullYear()
  const year = sameYear ? {} : { year: 'numeric' } as const
  return date.toLocaleString(timeLocale(lang), { ...year, month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
export function fullTime(value: string | undefined, lang: string): string {
  const date = new Date(value ?? '')
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString(timeLocale(lang))
}
/** Every ticket-card state maps onto the panel's existing stage and outcome labels, so no second vocabulary drifts. */
const TICKET_STATE_LABELS = {
  'person/delivery': 'stage.delivery', 'person/answer': 'stage.answer', 'person/review': 'stage.review',
  'person/blocked': 'stage.blocked', 'person/failed': 'stage.failed', 'working': 'stage.working',
  'working/queued': 'stage.queued', 'idle': 'stage.idle', 'completed': 'outcome.completed',
  'merged': 'outcome.merged', 'closed': 'outcome.closed', 'dropped': 'outcome.dropped', 'stopped': 'outcome.stopped'
} as const
export type TicketStateLabel = typeof TICKET_STATE_LABELS[keyof typeof TICKET_STATE_LABELS]
/** The localized label for a state the host may have added since this panel was built; unknown states keep their raw name. */
export const ticketStateLabel = (state: string): TicketStateLabel | undefined =>
  Object.hasOwn(TICKET_STATE_LABELS, state) ? TICKET_STATE_LABELS[state as keyof typeof TICKET_STATE_LABELS] : undefined
/** A state's visual tone: live work, a person's turn, finished history, or a hard stop. */
export type TicketTone = 'live' | 'person' | 'done' | 'muted' | 'error' | 'idle'
export function ticketTone(state: string): TicketTone {
  if (state === 'stopped' || state === 'person/failed') return 'error'
  if (state.startsWith('person/')) return 'person'
  if (state === 'working' || state === 'working/queued') return 'live'
  if (state === 'idle') return 'idle'
  if (state === 'completed' || state === 'merged' || state === 'closed') return 'done'
  if (state === 'dropped') return 'muted'
  // A state the panel has never seen stays neutral rather than alarming; its raw name still shows.
  return 'muted'
}
/** What a worker's latest assignment reported, in the panel's existing report vocabulary. */
const REPORT_STATE_LABELS = {
  queued: 'report.queued', running: 'report.running', progress: 'report.progress', waiting: 'report.waiting',
  ready: 'report.ready', blocked: 'report.blocked', failed: 'report.failed', dropped: 'report.dropped',
  completed: 'report.completed', merged: 'report.merged', closed: 'report.closed', stopped: 'report.stopped'
} as const
export type ReportStateLabel = typeof REPORT_STATE_LABELS[keyof typeof REPORT_STATE_LABELS]
export const reportStateLabel = (state: string): ReportStateLabel | undefined =>
  Object.hasOwn(REPORT_STATE_LABELS, state) ? REPORT_STATE_LABELS[state as keyof typeof REPORT_STATE_LABELS] : undefined
