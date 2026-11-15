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

describe('sendGithub progress comments', () => {
  const progress = (id: string, line: string, ticketId = 'tk1', number = '12'): OutboundMessage => ({ id, kind: 'notice', ticketId,
    text: `<!-- dsh-superagent-progress:${ticketId} -->\n${line}`,
    channel: { source: 'github', thread: `github:${number}`, address: { number } } })
  const deployment = { repository: 'acme/widgets', stateDir: '', mode: 'github',
    github: { cli: 'gh', login: 'agent-bot', noreply: 'x@users.noreply.github.com' } }
  const channel = (api: (...args: unknown[]) => Promise<unknown>, pages: unknown[] = []): Commands => ({
    deployment, api: vi.fn(api), pages: vi.fn(async () => pages),
  }) as unknown as Commands
  it('posts one progress comment, then patches the same comment with the lines already delivered', async () => {
    const commands = channel(async (...args: unknown[]) => args.includes('POST') ? { id: 100 } : {})
    const first = progress('p1', 'Started')
    expect(await sendGithub({ commands } as never, first, [])).toBe('sent')
    const post = vi.mocked(commands.api).mock.calls.at(-1)!
    expect(post[1]).toBe('issues/12/comments')
    expect(post).toContain('POST')
    expect(String(post.at(-1))).toContain('### Progress\n\n- Started')
    expect(String(post.at(-1))).toContain('<!-- dsh-superagent-progress:tk1 -->')

    const delivered = [{ ...first, sentAt: '2026-01-01T00:00:00.000Z' }] as DeliveredMessage[]
    expect(await sendGithub({ commands } as never, progress('p2', 'Ready for review'), delivered)).toBe('sent')
    const patch = vi.mocked(commands.api).mock.calls.at(-1)!
    expect(patch[1]).toBe('issues/comments/100')
    expect(patch).toContain('PATCH')
    expect(String(patch.at(-1))).toContain('- Started\n- Ready for review')
  })
  it('finds an existing progress comment by its marker after a restart, and patches it instead of posting', async () => {
    const commands = channel(async () => ({}), [{ id: 501, body: '<!-- dsh-superagent-progress:tk9 -->', user: { login: 'agent-bot' } }])
    expect(await sendGithub({ commands } as never, progress('p1', 'Started', 'tk9', '13'))).toBe('sent')
    expect(vi.mocked(commands.api).mock.calls.at(-1)![1]).toBe('issues/comments/501')
    expect(vi.mocked(commands.pages)).toHaveBeenCalledTimes(1)
  })
  it('posts again when the cached comment is gone, keeping the line instead of dropping it', async () => {
    let posts = 0
    const commands = channel(async (...args: unknown[]) => {
      if (args.includes('POST')) { posts += 1; return { id: posts === 1 ? 100 : 200 } }
      throw new CliError('Not Found', 404, 1)
    })
    const first = progress('p1', 'Started', 'tk8', '14')
    expect(await sendGithub({ commands } as never, first, [])).toBe('sent')
    const delivered = [{ ...first, sentAt: '2026-01-01T00:00:00.000Z' }] as DeliveredMessage[]
    expect(await sendGithub({ commands } as never, progress('p2', 'Failed', 'tk8', '14'), delivered)).toBe('sent')
    const last = vi.mocked(commands.api).mock.calls.at(-1)!
    expect(last).toContain('POST')
    expect(last[1]).toBe('issues/14/comments')
    expect(String(last.at(-1))).toContain('- Started\n- Failed')
  })
})

