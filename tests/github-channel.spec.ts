/**
 * sendGithub: the outbox's receipts short-circuit the idempotency sweep, and the marker POST and
 * gone handling keep their shape. These are the first direct tests the channel has had.
 */
import { describe, expect, it, vi } from 'vitest'
import type { OutboundMessage } from '../src/core/index.ts'
import { CliError, type Commands } from '../src/infra/commands.ts'
import { sendGithub } from '../src/sources/github-channel.ts'
import type { DeliveredMessage } from '../src/sources/kind.ts'

const message = (id = 'm1'): OutboundMessage => ({ id, text: 'hello', kind: 'reply',
  channel: { source: 'github', thread: 'github:12', address: { number: '12' } } })
const fake = (api?: () => Promise<unknown>): Commands => ({
  deployment: { repository: 'acme/widgets', stateDir: '', mode: 'github', github: { cli: 'gh', login: 'agent-bot', noreply: 'x@users.noreply.github.com' } },
  api: vi.fn(api ?? (async () => ({}))),
  pages: vi.fn(async () => []),
}) as unknown as Commands

describe('sendGithub', () => {
  it('treats a delivered receipt as proof and posts nothing', async () => {
    const commands = fake()
    const delivered = [{ ...message('m1'), sentAt: '2026-01-01T00:00:00.000Z' }] as DeliveredMessage[]
    expect(await sendGithub({ commands } as never, message('m1'), delivered)).toBe('sent')
    expect(vi.mocked(commands.api)).not.toHaveBeenCalled()
    expect(vi.mocked(commands.pages)).not.toHaveBeenCalled()
  })
  it('posts the body with its idempotency marker when no receipt exists', async () => {
    const commands = fake()
    expect(await sendGithub({ commands } as never, message('m1'))).toBe('sent')
    expect(vi.mocked(commands.pages)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(commands.pages).mock.calls[0]![1]).toBe('issues/12/comments?per_page=100')
    const call = vi.mocked(commands.api).mock.calls[0]!
    expect(call[1]).toBe('issues/12/comments')
    expect(String(call.at(-1))).toContain('<!-- dsh-superagent:m1 -->')
  })
  it('reads a deleted target as gone instead of retrying', async () => {
    const commands = fake(async () => { throw new CliError('Not Found', 410, 1) })
    expect(await sendGithub({ commands } as never, message('m1'))).toBe('gone')
  })
})
