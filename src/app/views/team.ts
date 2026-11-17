/** Team board: the configured team roles and the chief-of-staff tickets each one was dispatched. */
import { roleOfMeta } from '../../chat-router/config.ts'
import { workerSessionId } from '../../executor/dsh.ts'
import type { Ticket } from '../../core/index.ts'
import { ticketCard } from '../cards.ts'
import { snapshot, type ViewHost } from './records.ts'

/** A role card shows its newest few tickets; the board's counts still cover every one of them. */
const TICKETS_PER_ROLE = 8
/** Unassigned dispatches are a fallback lane, not the main event, so the board shows only the newest few. */
const UNASSIGNED_SHOWN = 6
/** What a team ticket adds to the ticket card: who owns it, which chat sent it, and what its worker last reported. */
function teamTicket(ticket: Ticket, meta: Record<string, unknown> | undefined, roleName: string | null) {
  return { ...ticketCard(ticket),
    role: typeof meta?.role === 'string' ? meta.role : null,
    role_name: roleName,
    chat_session: typeof meta?.chatSession === 'string' ? meta.chatSession : '',
    worker_session: workerSessionId(ticket.id),
    updated_at: ticket.updatedAt,
    report_state: ticket.assignments.at(-1)?.report?.state ?? null }
}
const live = (ticket: Ticket) => ticket.ended === undefined
/**
 * The team board groups every ticket a chief-of-staff chat dispatched by the role named on its Trigger, and keeps the
 * dispatch itself as the only source of truth: ordinary Source tickets carry no role and stay out of this page. A role
 * deleted from settings no longer has a card, so its history is counted as hidden instead of silently disappearing.
 */
export function teamBoard(host: ViewHost) {
  const view = snapshot(host)
  const { store } = view
  const chatRouter = store.settings().chatRouter
  const roles = chatRouter.team.roles
  const groups = new Map<string, { ticket: Ticket; meta: Record<string, unknown> | undefined }[]>(roles.map(role => [role.id, []]))
  const unassigned: { ticket: Ticket; meta: Record<string, unknown> | undefined }[] = []
  let hidden = 0
  for (const ticket of store.tickets.list()) {
    const meta = store.triggers.get(ticket.origin.triggerId)?.meta as Record<string, unknown> | undefined
    // The board is a view of dispatches, not of all work: a ticket without the marker is somebody else's queue.
    if (meta?.dispatchedBy !== 'chat-router') continue
    const role = typeof meta.role === 'string' ? meta.role : undefined
    if (!role) { unassigned.push({ ticket, meta }); continue }
    const group = groups.get(role)
    // A role is shown only while it is configured; `roleOfMeta` is the same resolver dispatch uses.
    if (group && roleOfMeta(chatRouter, meta)) group.push({ ticket, meta })
    else hidden += 1
  }
  const roleViews = roles.map(role => {
    const rows = (groups.get(role.id) ?? []).sort((a, b) => b.ticket.updatedAt.localeCompare(a.ticket.updatedAt))
    return { id: role.id, name: role.name, instruction: role.instruction,
      model: role.model ? { provider: role.model.provider, model: role.model.model } : null,
      tickets: rows.slice(0, TICKETS_PER_ROLE).map(({ ticket, meta }) => teamTicket(ticket, meta, role.name)),
      total: rows.length, live: rows.filter(({ ticket }) => live(ticket)).length, done: rows.filter(({ ticket }) => !live(ticket)).length,
      ...(rows[0] ? { last_at: rows[0].ticket.updatedAt } : {}) }
  })
  const unassignedViews = unassigned.sort((a, b) => b.ticket.updatedAt.localeCompare(a.ticket.updatedAt))
  return { generated_at: new Date().toISOString(), enabled: chatRouter.enabled, roles: roleViews,
    unassigned: unassignedViews.slice(0, UNASSIGNED_SHOWN).map(({ ticket, meta }) => teamTicket(ticket, meta, null)),
    unassigned_total: unassignedViews.length, hidden,
    totals: { roles: roles.length,
      live: roleViews.reduce((sum, role) => sum + role.live, 0) + unassignedViews.filter(({ ticket }) => live(ticket)).length,
      done: roleViews.reduce((sum, role) => sum + role.done, 0) + unassignedViews.filter(({ ticket }) => !live(ticket)).length,
      unassigned: unassignedViews.length } }
}
export type TeamBoardView = ReturnType<typeof teamBoard>
