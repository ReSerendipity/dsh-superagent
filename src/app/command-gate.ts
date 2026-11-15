/**
 * Pre-execution command gate and its approval ledger.
 *
 * The gate runs on DSH's `tools/pre-execute` waterfall, which receives the parsed arguments of a call before it dispatches:
 * `forbid` denies the call, `prompt` records a pending approval and denies until a person approves, and `allow` dispatches.
 * A policy that does not `enforce` returns allow before any I/O, so the record-only build keeps its behaviour exactly.
 *
 * Approvals live in `stateDir/approvals.jsonl` as one full record per line: the latest line for an id is its state, so the
 * file stays append-only and readable. A pending approval past its TTL is resolved as `expired` by `timeout` and audited
 * the same way, which is what makes "timeout means deny" true rather than implied.
 */
import { appendFile, mkdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { key } from '../core/index.ts'
import { evaluateCommand, splitCommandLine, type CommandDecision, type CommandEvaluation } from '../command-policy.ts'
import type { CommandAudit } from './command-audit.ts'
import type { Settings } from '../policy.ts'

/** The file one instance's approvals are recorded in. */
export const approvalsFile = (stateDir: string): string => join(stateDir, 'approvals.jsonl')

export type ApprovalState = 'pending' | 'approved' | 'denied' | 'used' | 'expired'

export interface ApprovalRecord {
  id: string
  /** When the approval was requested. */
  at: string
  ticket: string
  tool: string
  command: string
  argv: readonly string[]
  decision: CommandDecision
  rule?: string
  reason?: string
  state: ApprovalState
  ttlMinutes: number
  /** After this moment a pending approval is denied by timeout, and an approved one no longer admits the command. */
  expiresAt: string
  /** Who resolved or used it: a person through the main Session, the worker's retry, or `timeout`. */
  by?: string
  note?: string
  resolvedAt?: string
}

const nowIso = (now: number): string => new Date(now).toISOString()

/**
 * The approval ledger. Every mutation appends the record's new full state, then audits the transition: a pending request,
 * an approval, a denial, the use that consumes an approval, or an expiry by timeout. Read-modify-write runs serialized so
 * two tool calls cannot fold the same record twice.
 */
export class Approvals {
  private chain: Promise<unknown> = Promise.resolve()
  /**
   * @param host.file - the JSONL ledger.
   * @param host.audit - where each transition is recorded.
   * @param host.now - the clock, so tests can cross a TTL without waiting.
   */
  constructor(private readonly host: { file: string; audit: CommandAudit; now?: () => number }) {}

  /** The pending approvals, after expiring the ones past their TTL. Oldest first. */
  pending(): Promise<ApprovalRecord[]> {
    return this.serial(async () => [...(await this.load()).values()]
      .filter(record => record.state === 'pending').sort((a, b) => Date.parse(a.at) - Date.parse(b.at)))
  }

  /** Every record the ledger holds, one per id, latest state. */
  records(): Promise<ApprovalRecord[]> {
    return this.serial(async () => [...(await this.load()).values()].sort((a, b) => Date.parse(a.at) - Date.parse(b.at)))
  }

  /**
   * Requests an approval for one command, or returns the pending one for the same ticket and argv: a worker that retries a
   * prompt command does not spam the ledger. `by` is always the worker that tried the command.
   */
  request(input: Pick<ApprovalRecord, 'ticket' | 'tool' | 'command' | 'argv' | 'decision' | 'rule' | 'reason'>, ttlMinutes: number): Promise<ApprovalRecord> {
    return this.serial(async () => {
      const records = await this.load()
      const existing = [...records.values()].find(record => record.state === 'pending'
        && record.ticket === input.ticket && record.argv.join('\u0001') === input.argv.join('\u0001'))
      if (existing) return existing
      const now = this.now()
      const record: ApprovalRecord = {
        id: key('approval', input.ticket, input.argv.join('\u0001'), String(now)),
        at: nowIso(now), ...input, state: 'pending', ttlMinutes, expiresAt: nowIso(now + ttlMinutes * 60_000), by: 'worker',
      }
      await this.write(record)
      return record
    })
  }

  /** Resolves a pending approval as approved or denied; an approval already expired or resolved is refused. */
  resolve(id: string, state: 'approved' | 'denied', by: string, note?: string): Promise<ApprovalRecord> {
    return this.serial(async () => {
      const records = await this.load()
      const record = records.get(id)
      if (!record) throw new Error(`No approval ${id} is recorded`)
      if (record.state !== 'pending') throw new Error(`Approval ${id} is already ${record.state}`)
      const updated: ApprovalRecord = { ...record, state, by, ...note ? { note } : {}, resolvedAt: nowIso(this.now()) }
      await this.write(updated)
      return updated
    })
  }

  /** Consumes one approved approval for this ticket and command, if it has not expired; the returned record is now `used`. */
  claim(ticket: string, argv: readonly string[]): Promise<ApprovalRecord | undefined> {
    return this.serial(async () => {
      const records = await this.load()
      const approved = [...records.values()].find(record => record.state === 'approved'
        && record.ticket === ticket && record.argv.join('\u0001') === argv.join('\u0001'))
      if (!approved) return undefined
      const updated: ApprovalRecord = { ...approved, state: 'used', by: 'worker', resolvedAt: nowIso(this.now()) }
      await this.write(updated)
      return updated
    })
  }

  private now(): number { return this.host.now?.() ?? Date.now() }

  /** Runs one ledger operation at a time; a rejected operation must not block the next one. */
  private serial<T>(work: () => Promise<T>): Promise<T> {
    const run = this.chain.then(work, work)
    this.chain = run.then(() => undefined, () => undefined)
    return run
  }

  /** Reads every line and folds it by id, then expires pending records whose TTL has passed. */
  private async load(): Promise<Map<string, ApprovalRecord>> {
    const text = await readFile(this.host.file, 'utf8').catch(() => '')
    const records = new Map<string, ApprovalRecord>()
    for (const line of text.split('\n')) {
      if (!line.trim()) continue
      try {
        const record = JSON.parse(line) as ApprovalRecord
        if (record?.id) records.set(record.id, record)
      } catch { /* A torn last line is ignored; the ledger is readable up to it. */ }
    }
    for (const record of [...records.values()]) {
      // An approved approval is single-use but still bounded by the same TTL: a stale one must not admit a command later.
      if (record.state !== 'pending' && record.state !== 'approved') continue
      if (Date.parse(record.expiresAt) > this.now()) continue
      const updated: ApprovalRecord = { ...record, state: 'expired', by: 'timeout', resolvedAt: nowIso(this.now()) }
      await this.write(updated)
      records.set(updated.id, updated)
    }
    return records
  }

  /** Appends the record and audits the transition; an audit failure must not lose the approval itself. */
  private async write(record: ApprovalRecord): Promise<void> {
    await mkdir(dirname(this.host.file), { recursive: true })
    await appendFile(this.host.file, `${JSON.stringify(record)}\n`, 'utf8')
    // The audit is awaited so a reader that has seen the ledger sees its audit too; a failed audit still must not
    // lose the approval, so it is swallowed here.
    await this.host.audit.append({
      at: record.state === 'pending' ? record.at : record.resolvedAt ?? record.at,
      ticket: record.ticket, tool: 'approval', command: record.command, argv: record.argv,
      decision: record.decision, enforced: record.state === 'approved' || record.state === 'used' ? 'allow' : 'forbid',
      kind: 'approval', approvalId: record.id, ...record.by ? { by: record.by } : {}, ...record.note ? { note: record.note } : {},
      ...record.rule ? { rule: record.rule } : {}, ...record.reason ? { reason: record.reason } : {},
    }).catch(() => {})
  }
}

/** What `tools/pre-execute` should do with one call. */
export type GateDecision = { kind: 'allow' } | { kind: 'deny'; reason: string; approvalId?: string }

/** Reads the command line out of a shell tool's parsed arguments. */
function commandOf(args: unknown): string | undefined {
  if (!args || typeof args !== 'object') return undefined
  const command = (args as { command?: unknown }).command
  return typeof command === 'string' && command.trim() ? command : undefined
}

/**
 * Applies the command policy before a worker's shell call dispatches. With `enforce: false` it returns allow without
 * touching disk, which is the record-only build. With `enforce: true` it audits every judged attempt, denies `forbid`
 * outright, and turns `prompt` into a pending approval that the same command may consume once after a person approves it.
 */
export class CommandGate {
  constructor(private readonly host: { settings: () => Settings; audit: CommandAudit; approvals: Approvals }) {}

  /** Judges one worker shell call. `allow` means the caller should dispatch to the next pre-execute handler. */
  async guard(ticketId: string, tool: string, args: unknown): Promise<GateDecision> {
    if (tool !== 'bash' && tool !== 'pwsh') return { kind: 'allow' }
    const command = commandOf(args)
    if (!command) return { kind: 'allow' }
    const policy = this.host.settings().executor.commandPolicy
    if (!policy.enforce) return { kind: 'allow' }
    const argv = splitCommandLine(command)
    if (!argv.length) return { kind: 'allow' }
    const evaluation = evaluateCommand(policy, argv)
    if (evaluation.decision === 'allow') {
      await this.record(ticketId, tool, command, evaluation, 'allow')
      return { kind: 'allow' }
    }
    if (evaluation.decision === 'forbid') {
      await this.record(ticketId, tool, command, evaluation, 'forbid')
      return { kind: 'deny', reason: this.forbidden(evaluation) }
    }
    const approved = await this.host.approvals.claim(ticketId, argv)
    if (approved) return { kind: 'allow' }
    const pending = await this.host.approvals.request({ ticket: ticketId, tool, command, argv: evaluation.argv,
      decision: evaluation.decision, ...evaluation.matched ? { rule: evaluation.matched.id } : {},
      ...evaluation.matched?.reason ? { reason: evaluation.matched.reason } : {} }, policy.approvalTtlMinutes)
    return { kind: 'deny', reason: this.needsApproval(pending.id), approvalId: pending.id }
  }

  /** Approves a pending command, so the worker may run exactly that command once until the approval expires. */
  async approve(id: string, by: string, note?: string): Promise<ApprovalRecord> {
    return this.host.approvals.resolve(id, 'approved', by, note)
  }

  /** Denies a pending command; the worker cannot run it until a new approval is requested and granted. */
  async deny(id: string, by: string, note?: string): Promise<ApprovalRecord> {
    return this.host.approvals.resolve(id, 'denied', by, note)
  }

  private forbidden(evaluation: CommandEvaluation): string {
    const rule = evaluation.matched
    return `Command policy${rule ? ` rule "${rule.id}"` : ''} forbids this command${rule?.reason ? `: ${rule.reason}` : '.'} `
      + 'Do not retry it unchanged; use another action or ask a person to change the policy.'
  }

  private needsApproval(id: string): string {
    return `This command needs a person's approval (approval ${id}); it will not run until a person approves it with `
      + 'orchestrator_command_approve and the worker runs the same command again. A pending approval expires as a denial.'
  }

  private async record(ticketId: string, tool: string, command: string, evaluation: CommandEvaluation, enforced: CommandDecision): Promise<void> {
    await this.host.audit.append({
      at: new Date().toISOString(), ticket: ticketId, tool, command: command.length > 2000 ? `${command.slice(0, 1999)}…` : command,
      argv: evaluation.argv.slice(0, 12), decision: evaluation.decision, enforced, kind: 'command',
      ...evaluation.matched ? { rule: evaluation.matched.id } : {},
      ...evaluation.matched?.reason ? { reason: evaluation.matched.reason } : {},
    }).catch(() => {})
  }
}
