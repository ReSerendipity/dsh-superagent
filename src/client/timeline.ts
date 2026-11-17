/** Turns a ticket's existing aggregates into one chronological timeline, without changing the server contract. */
import type { TicketPageView } from './api.ts'

type TriggerInput = Extract<TicketPageView['inputs'][number], { kind: 'trigger' }>
type Actor = NonNullable<TriggerInput['trigger']>['actor']
export type TimelineGroup = 'message' | 'event' | 'report'
export type TimelineTone = 'neutral' | 'info' | 'success' | 'warn' | 'error'
export type TimelineFilter = 'all' | TimelineGroup
export type TimelineKind = 'decision' | 'created' | 'trigger' | 'text' | 'note' | 'policy' | 'reopen' | 'resume'
  | 'assigned' | 'started' | 'assignmentEnded' | 'report' | 'ended'
export interface TimelineEntry {
  id: string
  at: string
  group: TimelineGroup
  kind: TimelineKind
  tone: TimelineTone
  /** Message body, report summary, or a short system detail; rendered as Markdown-lite. */
  text?: string
  /** Report state as the worker wrote it, localized by the caller. */
  state?: string
  /** 1-based Assignment number. */
  number?: number
  undelivered?: boolean
  actor?: Actor
  link?: { thread: string; trigger: string }
  outcome?: string
  from?: string
  to?: string
  reason?: string
}
const reportTone = (state: string | undefined): TimelineTone => {
  if (state === 'ready' || state === 'completed' || state === 'merged') return 'success'
  if (state === 'failed') return 'error'
  if (state === 'blocked' || state === 'waiting') return 'warn'
  if (state === 'dropped' || state === 'closed' || state === 'stopped') return 'neutral'
  return 'info'
}
const endedTone = (outcome: string | undefined): TimelineTone =>
  outcome === 'completed' || outcome === 'merged' ? 'success' : 'neutral'
/**
 * Newest first. Ties keep the later-pushed event above the earlier one, so a ticket created and accepted in the same
 * second reads "created" then "accepted" downwards. The input is the ticket detail view, so every entry traces back to a
 * stored aggregate rather than to a derived guess.
 */
export function ticketTimeline(ticket: TicketPageView): TimelineEntry[] {
  const entries: TimelineEntry[] = []
  if (ticket.decision) {
    const outcome = ticket.decision.outcome
    entries.push({ id: 'decision', at: ticket.decision.at, group: 'event', kind: 'decision', outcome,
      tone: outcome === 'accept' ? 'success' : outcome === 'reopen' ? 'info' : 'neutral', text: ticket.decision.preview })
  }
  entries.push({ id: 'created', at: ticket.createdAt, group: 'event', kind: 'created', tone: 'neutral' })
  for (const input of ticket.inputs) {
    if (input.kind === 'trigger') {
      const trigger = input.trigger
      if (!trigger) continue
      entries.push({ id: `input:${input.id}`, at: input.at, group: 'message', kind: 'trigger', tone: input.delivered ? 'info' : 'warn',
        text: trigger.preview, actor: trigger.actor, undelivered: !input.delivered,
        link: { thread: trigger.thread, trigger: trigger.id } })
    } else if (input.kind === 'text' || input.kind === 'note') {
      entries.push({ id: `input:${input.id}`, at: input.at, group: 'message', kind: input.kind,
        tone: input.kind === 'text' ? 'info' : 'neutral', text: input.text })
    } else if (input.kind === 'policy-changed') {
      entries.push({ id: `input:${input.id}`, at: input.at, group: 'event', kind: 'policy', tone: 'warn',
        from: input.from, to: input.to })
    } else if (input.kind === 'reopen') {
      entries.push({ id: `input:${input.id}`, at: input.at, group: 'event', kind: 'reopen', tone: 'info', text: input.decisionId })
    } else {
      entries.push({ id: `input:${input.id}`, at: input.at, group: 'event', kind: 'resume', tone: 'info', text: input.triggerId })
    }
  }
  ticket.assignments.forEach((assignment, index) => {
    const number = index + 1
    entries.push({ id: `assignment:${assignment.id}`, at: assignment.createdAt, group: 'event', kind: 'assigned',
      tone: 'neutral', number })
    if (assignment.startedAt) {
      entries.push({ id: `assignment:${assignment.id}:start`, at: assignment.startedAt, group: 'event', kind: 'started',
        tone: 'info', number })
    }
    if (assignment.report) {
      entries.push({ id: `assignment:${assignment.id}:report`, at: assignment.report.at, group: 'report', kind: 'report',
        tone: reportTone(assignment.report.state), state: assignment.report.state, text: assignment.report.summary, number })
    }
    if (assignment.endedAt) {
      entries.push({ id: `assignment:${assignment.id}:end`, at: assignment.endedAt, group: 'event', kind: 'assignmentEnded',
        tone: 'neutral', number, reason: assignment.endedReason })
    }
  })
  if (ticket.ended) {
    entries.push({ id: 'ended', at: ticket.ended.at, group: 'event', kind: 'ended', tone: endedTone(ticket.ended.outcome),
      outcome: ticket.ended.outcome, reason: ticket.ended.reason })
  }
  return entries.map((entry, index) => ({ entry, index }))
    .sort((a, b) => b.entry.at.localeCompare(a.entry.at) || b.index - a.index)
    .map(item => item.entry)
}
