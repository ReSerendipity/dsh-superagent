/** Explicit allowlist export: workflow shape without task text, account identifiers or machine configuration. */
import { createHash } from 'node:crypto'
import type { Ticket } from '../core/index.ts'

const correlation = (id: string) => createHash('sha256').update(id).digest('hex').slice(0, 16)
export function ticketDiagnostic(ticket: Ticket) {
  return {
    schema: 'dsh-superagent-diagnostic/v1' as const,
    ticket: correlation(ticket.id),
    ended: !!ticket.ended,
    outcome: ticket.ended?.outcome ?? null,
    attention: !!ticket.attention,
    deliveryFailed: !!ticket.delivery,
    inputCount: ticket.inputs.length,
    undeliveredCount: ticket.undelivered.length,
    channelCount: ticket.channels.length,
    assignments: ticket.assignments.map(assignment => ({
      id: correlation(assignment.id), state: assignment.state,
      report: assignment.report?.state ?? null,
      started: !!assignment.startedAt, ended: !!assignment.endedAt,
      idle: !!assignment.idleAt,
    })),
  }
}
export type TicketDiagnostic = ReturnType<typeof ticketDiagnostic>
