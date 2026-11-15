/** Progress comment helpers: marker round trip, body composition, and the GitHub-only notifier. */
import { describe, expect, it, vi } from 'vitest'
import type { OutboundMessage, Ticket } from '../src/core/index.ts'
import { PROGRESS_PREFIX, ProgressNotifier, progressBody, progressLine, progressTicket } from '../src/app/progress.ts'

const github = { source: 'github', thread: 'github:12', address: { number: '12' } }
const text = (ticketId: string, line: string): string => `${PROGRESS_PREFIX}${ticketId} -->\n${line}`
const ticket = (channels: Ticket['channels']): Ticket => ({ id: 'tk1', channels } as Ticket)

describe('progress markers', () => {
  it('reads back the ticket and line, and ignores ordinary messages', () => {
    expect(progressTicket(text('tk1', 'Started'))).toBe('tk1')
    expect(progressLine(text('tk1', 'Started'))).toBe('Started')
    expect(progressTicket('hello')).toBeUndefined()
    expect(progressLine('hello')).toBe('')
  })
  it('composes a heading, the most recent lines, and the marker a PATCH finds it by', () => {
    const lines = ['one', 'two', '', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']
    const body = progressBody('tk1', lines)
    expect(body).toContain('### Progress')
    expect(body).toContain('- nine')
    expect(body).not.toContain('- one')
    expect(body.trimEnd().endsWith(`${PROGRESS_PREFIX}tk1 -->`)).toBe(true)
    expect(progressBody('tk1', [])).toContain(`${PROGRESS_PREFIX}tk1 -->`)
  })
})

describe('ProgressNotifier', () => {
  const notifier = (channels: Ticket['channels']) => {
    const outbox = { send: vi.fn<(message: OutboundMessage) => void>() }
    const store = { tickets: { get: (id: string) => id === 'tk1' ? ticket(channels) : undefined } }
    return { notifier: new ProgressNotifier({ store, outbox } as never), outbox }
  }
  it('sends one notice to the ticket\'s GitHub channel, with a marker and the line', () => {
    const { notifier: send, outbox } = notifier([github])
    send.update('tk1', 'Started')
    expect(outbox.send).toHaveBeenCalledTimes(1)
    const message = outbox.send.mock.calls[0]![0]
    expect(message).toMatchObject({ kind: 'notice', ticketId: 'tk1', channel: github })
    expect(message.text).toBe(text('tk1', 'Started'))
  })
  it('sends nothing for another channel, a ticket without a GitHub channel, or an unknown ticket', () => {
    const feishu = notifier([{ source: 'feishu', thread: 'feishu:oc', address: { chatId: 'oc' } }] as never)
    feishu.notifier.update('tk1', 'Started')
    expect(feishu.outbox.send).not.toHaveBeenCalled()
    const elsewhere = notifier([])
    elsewhere.notifier.update('tk1', 'Started')
    expect(elsewhere.outbox.send).not.toHaveBeenCalled()
    const unknown = notifier([github])
    unknown.notifier.update('tk2', 'Started')
    expect(unknown.outbox.send).not.toHaveBeenCalled()
  })
  it('uses one id per line, so the same line is never recorded twice', () => {
    const { notifier: send, outbox } = notifier([github])
    send.update('tk1', 'Started')
    send.update('tk1', 'Started')
    send.update('tk1', 'Ready for review')
    const ids = outbox.send.mock.calls.map(([message]) => message.id)
    expect(ids[1]).toBe(ids[0])
    expect(ids[2]).not.toBe(ids[0])
  })
})
