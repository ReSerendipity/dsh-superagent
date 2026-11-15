/** Command policy evaluation, command-line splitting, the settings default, and the audit file's round trip. */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { afterAll, describe, expect, it } from 'vitest'
import { CommandAudit, commandAuditFile } from '../src/app/command-audit.ts'
import { CommandPolicySchema, DEFAULT_COMMAND_POLICY, evaluateCommand, splitCommandLine, type CommandPolicy }
  from '../src/command-policy.ts'
import { SettingsSchema } from '../src/policy.ts'
import { DshExecutor } from '../src/executor/dsh.ts'

const dir = mkdtempSync(join(tmpdir(), 'dsh-command-policy-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

const policy = (overrides: Partial<CommandPolicy> = {}): CommandPolicy => CommandPolicySchema.parse({
  enforce: false, default: 'allow', rules: [], ...overrides,
})

describe('evaluateCommand', () => {
  it('falls back to the default decision when no rule matches', () => {
    expect(evaluateCommand(policy(), ['git', 'status'])).toEqual({ argv: ['git', 'status'], decision: 'allow', enforced: 'allow', matched: undefined })
    expect(evaluateCommand(policy({ default: 'prompt' }), ['ls']).decision).toBe('prompt')
  })
  it('matches an argv prefix, and never a longer command that only contains it', () => {
    const force = policy({ rules: [{ id: 'force', match: ['git', 'push', '--force'], decision: 'forbid' }] })
    expect(evaluateCommand(force, ['git', 'push', '--force']).decision).toBe('forbid')
    expect(evaluateCommand(force, ['git', 'push', '--force', 'origin', 'main']).decision).toBe('forbid')
    expect(evaluateCommand(force, ['git', 'push', 'origin', 'main']).decision).toBe('allow')
    expect(evaluateCommand(force, ['git', 'status']).matched).toBeUndefined()
  })
  it('compares the program name case-insensitively and the arguments exactly', () => {
    const merge = policy({ rules: [{ id: 'merge', match: ['gh', 'pr', 'merge'], decision: 'prompt' }] })
    expect(evaluateCommand(merge, ['GH', 'pr', 'merge', '12']).decision).toBe('prompt')
    expect(evaluateCommand(merge, ['gh', 'pr', 'merge', '12']).decision).toBe('prompt')
    expect(evaluateCommand(merge, ['gh', 'pr', 'MERGE']).decision).toBe('allow')
  })
  it('lets the longest matching prefix win, and the stricter rule win a tie', () => {
    const layered = policy({ rules: [
      { id: 'git', match: ['git'], decision: 'prompt' },
      { id: 'git-push', match: ['git', 'push'], decision: 'allow' },
      { id: 'push-allow', match: ['git', 'push'], decision: 'allow' },
      { id: 'push-forbid', match: ['git', 'push'], decision: 'forbid' },
    ] })
    expect(evaluateCommand(layered, ['git', 'status']).matched?.id).toBe('git')
    expect(evaluateCommand(layered, ['git', 'push']).matched?.id).toBe('push-forbid')
    expect(evaluateCommand(layered, ['git', 'push']).decision).toBe('forbid')
  })
  it('records decisions while the policy is record-only, and enforces only when asked', () => {
    const rules: CommandPolicy['rules'] = [{ id: 'force', match: ['git', 'push', '--force'], decision: 'forbid', reason: 'rewrites history' }]
    const recorded = evaluateCommand(policy({ rules }), ['git', 'push', '--force'])
    expect(recorded.decision).toBe('forbid')
    expect(recorded.enforced).toBe('allow')
    expect(recorded.matched).toEqual({ id: 'force', decision: 'forbid', reason: 'rewrites history' })
    expect(evaluateCommand(policy({ rules, enforce: true }), ['git', 'push', '--force']).enforced).toBe('forbid')
  })
  it('flags force-push and repository deletion by default, and leaves delivery commands alone', () => {
    expect(evaluateCommand(DEFAULT_COMMAND_POLICY, ['git', 'push', '--force', 'origin', 'main']).decision).toBe('forbid')
    expect(evaluateCommand(DEFAULT_COMMAND_POLICY, ['gh', 'repo', 'delete', 'acme/widgets']).decision).toBe('forbid')
    for (const argv of [['git', 'push', '-u', 'origin', 'agent/fix'], ['gh', 'pr', 'create'], ['gh', 'pr', 'view', '12'],
      ['lark-cli', 'im', '+messages-reply'], ['gh', 'api', 'repos/acme/widgets/issues/12/comments']])
      expect(evaluateCommand(DEFAULT_COMMAND_POLICY, argv)).toMatchObject({ decision: 'allow', enforced: 'allow' })
  })
})

describe('splitCommandLine', () => {
  it('keeps quoted arguments together and honours escaped quotes', () => {
    expect(splitCommandLine('git commit -m "a message with spaces"')).toEqual(['git', 'commit', '-m', 'a message with spaces'])
    expect(splitCommandLine(`gh pr create --body 'single quoted'`)).toEqual(['gh', 'pr', 'create', '--body', 'single quoted'])
    expect(splitCommandLine('git commit -m "say \\"hi\\""')).toEqual(['git', 'commit', '-m', 'say "hi"'])
  })
  it('keeps Windows path separators and drops empty whitespace runs', () => {
    expect(splitCommandLine('  git add C:\\work\\repo\\src\\a.ts  ')).toEqual(['git', 'add', 'C:\\work\\repo\\src\\a.ts'])
    expect(splitCommandLine('')).toEqual([])
    expect(splitCommandLine('   ')).toEqual([])
  })
})

describe('settings default', () => {
  it('parses a default record-only command policy with the three baseline rules', () => {
    const settings = SettingsSchema.parse({})
    expect(settings.executor.commandPolicy).toMatchObject({ enforce: false, default: 'allow' })
    expect(settings.executor.commandPolicy.rules.map(rule => rule.id)).toEqual(['force-push', 'force-push-short', 'repo-delete'])
  })
  it('rejects a rule whose decision is outside the four states, and an empty match', () => {
    expect(CommandPolicySchema.safeParse({ rules: [{ id: 'x', match: ['git'], decision: 'block' }] }).success).toBe(false)
    expect(CommandPolicySchema.safeParse({ rules: [{ id: 'x', match: [], decision: 'allow' }] }).success).toBe(false)
  })
})

describe('CommandAudit', () => {
  it('appends entries and reads back the most recent ones, skipping unreadable lines', async () => {
    const audit = new CommandAudit(commandAuditFile(dir))
    const base = { at: '2026-11-15T00:00:00.000Z', ticket: 't1', tool: 'pwsh', command: 'git status', argv: ['git', 'status'],
      decision: 'allow', enforced: 'allow' } as const
    await audit.append(base)
    await audit.append({ ...base, at: '2026-11-15T00:00:01.000Z', command: 'git push --force', argv: ['git', 'push', '--force'],
      decision: 'forbid', enforced: 'allow', rule: 'force-push' })
    expect(await audit.recent()).toHaveLength(2)
    expect((await audit.recent(1))[0]).toMatchObject({ decision: 'forbid', rule: 'force-push' })
    expect(await new CommandAudit(commandAuditFile(join(dir, 'missing'))).recent()).toEqual([])
  })
  it('rotates to one sibling once the file reaches its cap', async () => {
    const file = commandAuditFile(join(dir, 'rotate'))
    const audit = new CommandAudit(file, 0)
    const entry = { at: '2026-11-15T00:00:00.000Z', tool: 'pwsh', command: 'ls', argv: ['ls'], decision: 'allow', enforced: 'allow' } as const
    await audit.append(entry)
    await audit.append(entry)
    expect((await audit.recent()).length).toBeLessThanOrEqual(1)
    expect(await audit.recent()).toHaveLength(1)
  })
})

/** Polls until `check` passes, so the executor's fire-and-forget record has time to reach the file. */
async function until(check: () => Promise<boolean>): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await check()) return
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw new Error('the audit entry never appeared')
}

describe('DshExecutor record-only audit', () => {
  it('records a worker shell call against the policy, and leaves the decision unenforced', async () => {
    const ctx = new Context()
    const stateDir = join(dir, 'state')
    const audit = new CommandAudit(commandAuditFile(stateDir))
    const host = {
      context: ctx, engine: {}, effects: { handle: () => {} }, health: {}, machine: { stateDir, mode: 'local' },
      store: { tickets: { get: () => undefined }, settings: () => SettingsSchema.parse({}), atomic: (work: () => void) => work() },
      lifetime: new AbortController().signal, sessions: {}, closing: () => false, paused: () => false,
      environment: () => [], sourceLink: async () => ({}), repliedTo: () => undefined, progress: () => {},
      audit, commandGate: { guard: async () => ({ kind: 'allow' }) },
    }
    const executor = new DshExecutor(host as never)
    executor.install()
    ctx.emit('session/event', { id: 'worker-tk1' } as never, { type: 'tool/call',
      data: { turn: 0, step: 0, callId: 'c1', name: 'pwsh', arguments: JSON.stringify({ command: 'git push --force origin main' }) } } as never)
    await until(async () => (await audit.recent()).length === 1)
    expect((await audit.recent())[0]).toMatchObject({ ticket: 'tk1', tool: 'pwsh', decision: 'forbid', enforced: 'allow', rule: 'force-push' })
    executor.dispose()
  })
})
