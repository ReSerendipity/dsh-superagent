/**
 * The pre-execute command gate: allow/prompt/forbid under `enforce`, the approval ledger and its TTL, timeout-as-deny,
 * and the main Session's approve/deny tools.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { CommandAudit, commandAuditFile } from '../src/app/command-audit.ts'
import { Approvals, CommandGate, approvalsFile } from '../src/app/command-gate.ts'
import { mainTools, type MainToolsHost } from '../src/app/tools/main.ts'
import { CommandPolicySchema, type CommandPolicy } from '../src/command-policy.ts'
import type { Settings } from '../src/policy.ts'

const dir = mkdtempSync(join(tmpdir(), 'dsh-command-gate-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

let sequence = 0
/** One instance's audit, ledger and gate; `now` moves the clock so a TTL can pass without waiting. */
function workshop(options: { policy?: Partial<CommandPolicy>; now?: () => number } = {}) {
  const stateDir = join(dir, `state-${sequence++}`)
  const audit = new CommandAudit(commandAuditFile(stateDir))
  const approvals = new Approvals({ file: approvalsFile(stateDir), audit, now: options.now })
  const settings = () => ({ executor: { commandPolicy: CommandPolicySchema.parse({ enforce: true, ...options.policy }) } }) as unknown as Settings
  const gate = new CommandGate({ settings, audit, approvals })
  return { stateDir, audit, approvals, gate }
}
const shell = (text: string) => ({ command: text })

describe('CommandGate', () => {
  it('is record-only by default: a forbidden command still runs and nothing is written', async () => {
    const { gate, audit, stateDir } = workshop({ policy: { enforce: false,
      rules: [{ id: 'force', match: ['git', 'push', '--force'], decision: 'forbid' }] } })
    expect(await gate.guard('tk1', 'pwsh', shell('git push --force origin main'))).toEqual({ kind: 'allow' })
    expect(await audit.recent()).toEqual([])
    expect(existsSync(approvalsFile(stateDir))).toBe(false)
  })

  it('denies a forbidden command under enforce, with the rule and its reason recorded', async () => {
    const { gate, audit } = workshop({ policy: { rules: [
      { id: 'force', match: ['git', 'push', '--force'], decision: 'forbid', reason: 'rewrites published history' },
    ] } })
    const decision = await gate.guard('tk1', 'pwsh', shell('git push --force origin main'))
    expect(decision).toMatchObject({ kind: 'deny' })
    if (decision.kind !== 'deny') throw new Error('expected a denial')
    expect(decision.reason).toContain('force')
    expect(decision.reason).toContain('rewrites published history')
    expect(await audit.recent()).toMatchObject([{ kind: 'command', ticket: 'tk1', tool: 'pwsh', decision: 'forbid', enforced: 'forbid', rule: 'force' }])
  })

  it('allows an unmatched command under enforce and audits it', async () => {
    const { gate, audit } = workshop()
    expect(await gate.guard('tk1', 'bash', shell('git status'))).toEqual({ kind: 'allow' })
    expect(await audit.recent()).toMatchObject([{ kind: 'command', decision: 'allow', enforced: 'allow' }])
  })

  it('holds a prompt command as a pending approval, and one approval admits exactly one retry', async () => {
    const { gate, approvals, stateDir } = workshop({ policy: { rules: [
      { id: 'merge', match: ['gh', 'pr', 'merge'], decision: 'prompt', reason: 'merging is a person\'s decision' },
    ] } })
    const first = await gate.guard('tk1', 'pwsh', shell('gh pr merge 7 --squash'))
    expect(first).toMatchObject({ kind: 'deny' })
    if (first.kind !== 'deny') throw new Error('expected a denial')
    const id = first.approvalId!
    expect(first.reason).toContain('orchestrator_command_approve')
    expect(await approvals.pending()).toMatchObject([{ id, ticket: 'tk1', state: 'pending', decision: 'prompt', ttlMinutes: 10 }])
    // The request is on disk: one full record per line, latest line per id.
    const lines = readFileSync(approvalsFile(stateDir), 'utf8').trim().split('\n')
    expect(JSON.parse(lines.at(-1)!)).toMatchObject({ id, state: 'pending', command: 'gh pr merge 7 --squash' })

    await gate.approve(id, 'main-session', 'the person asked for this merge')
    expect(await gate.guard('tk1', 'pwsh', shell('gh pr merge 7 --squash'))).toEqual({ kind: 'allow' })
    expect(await approvals.records()).toMatchObject([{ id, state: 'used', by: 'worker' }])
    // The approval is consumed: a third attempt asks for a new one rather than using the old id.
    const third = await gate.guard('tk1', 'pwsh', shell('gh pr merge 7 --squash'))
    expect(third.kind).toBe('deny')
    if (third.kind !== 'deny') throw new Error('expected a denial')
    expect(third.approvalId).not.toBe(id)
  })

  it('refuses a denied approval and makes the worker request a new one', async () => {
    const { gate, approvals } = workshop({ policy: { rules: [{ id: 'merge', match: ['gh', 'pr', 'merge'], decision: 'prompt' }] } })
    const first = await gate.guard('tk1', 'pwsh', shell('gh pr merge 7'))
    if (first.kind !== 'deny') throw new Error('expected a denial')
    const id = first.approvalId!
    await gate.deny(id, 'main-session', 'no merge today')
    expect(await approvals.records()).toMatchObject([{ id, state: 'denied', by: 'main-session', note: 'no merge today' }])
    const second = await gate.guard('tk1', 'pwsh', shell('gh pr merge 7'))
    expect(second.kind).toBe('deny')
    if (second.kind !== 'deny') throw new Error('expected a denial')
    expect(second.approvalId).not.toBe(id)
  })

  it('expires a pending approval by timeout and audits it as a denial', async () => {
    let clock = Date.parse('2026-11-15T00:00:00.000Z')
    const { gate, approvals, audit } = workshop({ now: () => clock, policy: { approvalTtlMinutes: 1,
      rules: [{ id: 'merge', match: ['gh', 'pr', 'merge'], decision: 'prompt' }] } })
    const first = await gate.guard('tk1', 'pwsh', shell('gh pr merge 7'))
    if (first.kind !== 'deny') throw new Error('expected a denial')
    const id = first.approvalId!
    clock += 61_000
    expect(await approvals.pending()).toEqual([])
    expect(await approvals.records()).toMatchObject([{ id, state: 'expired', by: 'timeout' }])
    expect(await audit.recent()).toContainEqual(expect.objectContaining({ kind: 'approval', approvalId: id, by: 'timeout', enforced: 'forbid' }))
    // Approving after the timeout is refused, and the retry is a new pending approval.
    await expect(gate.approve(id, 'main-session')).rejects.toThrow('expired')
    const second = await gate.guard('tk1', 'pwsh', shell('gh pr merge 7'))
    if (second.kind !== 'deny') throw new Error('expected a denial')
    expect(second.approvalId).not.toBe(id)
  })

  it('does not let an approved approval outlive its TTL', async () => {
    let clock = Date.parse('2026-11-15T00:00:00.000Z')
    const { gate, approvals } = workshop({ now: () => clock, policy: { approvalTtlMinutes: 1,
      rules: [{ id: 'merge', match: ['gh', 'pr', 'merge'], decision: 'prompt' }] } })
    const pending = await gate.guard('tk1', 'pwsh', shell('gh pr merge 7'))
    if (pending.kind !== 'deny') throw new Error('expected a denial')
    await gate.approve(pending.approvalId!, 'main-session')
    clock += 61_000
    expect(await gate.guard('tk1', 'pwsh', shell('gh pr merge 7'))).toMatchObject({ kind: 'deny' })
    expect(await approvals.records()).toContainEqual(expect.objectContaining({ id: pending.approvalId, state: 'expired', by: 'timeout' }))
  })

  it('passes non-shell tools and shell calls without a command line through untouched', async () => {
    const { gate, audit } = workshop({ policy: { rules: [{ id: 'force', match: ['git', 'push', '--force'], decision: 'forbid' }] } })
    expect(await gate.guard('tk1', 'orchestrator_read', shell('git push --force'))).toEqual({ kind: 'allow' })
    expect(await gate.guard('tk1', 'pwsh', {})).toEqual({ kind: 'allow' })
    expect(await audit.recent()).toEqual([])
  })

  it('refuses to resolve an approval it does not know', async () => {
    const { gate } = workshop()
    await expect(gate.approve('missing', 'main-session')).rejects.toThrow('No approval missing is recorded')
    await expect(gate.deny('missing', 'main-session')).rejects.toThrow('No approval missing is recorded')
  })
})

describe('main Session approval tools', () => {
  it('lists the approve/deny tools and resolves a pending approval through them', async () => {
    const { gate, approvals } = workshop({ policy: { rules: [{ id: 'merge', match: ['gh', 'pr', 'merge'], decision: 'prompt' }] } })
    const pending = await gate.guard('tk1', 'pwsh', shell('gh pr merge 9'))
    if (pending.kind !== 'deny') throw new Error('expected a denial')
    const tools = mainTools({ resources: {}, sessions: {}, settings: () => ({}), commandGate: gate } as unknown as MainToolsHost, {} as never)
    const names = tools.map(item => item.name)
    expect(names).toContain('orchestrator_command_approve')
    expect(names).toContain('orchestrator_command_deny')
    const approve = tools.find(item => item.name === 'orchestrator_command_approve')!
    const result = await approve.execute({ approval_id: pending.approvalId! } as never, new AbortController().signal)
    expect(result).toMatchObject({ approval_id: pending.approvalId, state: 'approved', ticket: 'tk1', by: 'main-session' })
    expect(await approvals.records()).toMatchObject([{ state: 'approved', by: 'main-session' }])
  })
})
