/**
 * Progress comments: one GitHub comment per ticket that later progress lines update in place, so a ticket's feed is
 * a progress comment plus a result comment instead of one comment per message.
 *
 * A progress message keeps its ticket in an HTML marker (invisible in rendered Markdown) because it travels through the
 * ordinary receipt outbox as a `notice`; the GitHub channel recognises the marker, composes the body from the progress
 * messages already delivered to that thread, and PATCHes the comment it finds. Other channels have no single comment to
 * update, so they get nothing rather than a marker leaking into visible text.
 */
import { key, type OutboundMessage, type Ticket } from '../core/index.ts'
import type { Outbox } from './outbox.ts'
import type { Store } from './store.ts'

export const PROGRESS_PREFIX = '<!-- dsh-superagent-progress:'

/** The ticket a progress message belongs to, read back from its marker; undefined for any other message. */
export function progressTicket(text: string): string | undefined {
  if (!text.startsWith(PROGRESS_PREFIX)) return undefined
  const end = text.indexOf(' -->', PROGRESS_PREFIX.length)
  return end < 0 ? undefined : text.slice(PROGRESS_PREFIX.length, end)
}

/** The human-readable line a progress message carries, without its marker line. */
export function progressLine(text: string): string {
  const newline = text.indexOf('\n')
  return newline < 0 ? '' : text.slice(newline + 1).trim()
}

/** The body of a progress comment: a heading, the most recent lines, and the marker a PATCH finds the comment by. */
export function progressBody(ticketId: string, lines: readonly string[], limit = 8): string {
  const kept = lines.map(line => line.trim()).filter(Boolean).slice(-limit)
  return `### Progress\n\n${kept.map(line => `- ${line}`).join('\n')}\n\n${PROGRESS_PREFIX}${ticketId} -->`
}

/** Sends a ticket's progress lines as one `notice` to its GitHub channel, which keeps one comment updated. */
export class ProgressNotifier {
  constructor(private readonly host: { store: Pick<Store, 'tickets'>; outbox: Pick<Outbox, 'send'> }) {}

  /**
   * Records one progress line for a ticket whose conversation is on GitHub. A repeated line is dropped by the receipt
   * id, and nothing is sent for a ticket with no GitHub channel.
   */
  update(ticketId: string, line: string): void {
    const ticket: Ticket | undefined = this.host.store.tickets.get(ticketId)
    const channel = ticket?.channels.find(item => item.source === 'github')
    if (!ticket || !channel) return
    const message: OutboundMessage = { id: key('progress', ticketId, line), channel, text: `${PROGRESS_PREFIX}${ticketId} -->\n${line}`,
      kind: 'notice', ticketId }
    this.host.outbox.send(message)
  }
}
