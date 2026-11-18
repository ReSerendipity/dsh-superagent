/** Optional host-run checks: receipts bind real command success to a specific assignment and repository contents. */
import { createHash } from 'node:crypto'
import { liveTicket, runningAssignment, type Ticket } from '../core/index.ts'
import type { Store } from '../app/store.ts'
import type { CommandGate } from '../app/command-gate.ts'
import { family } from '../kv.ts'
import { commandShell } from '../infra/platform.ts'

const receiptKey = family<{ fingerprint: string; checkedAt: string }, [ticket: string]>('worker-verification:')
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
interface Host {
  store: Pick<Store, 'tickets' | 'get' | 'set' | 'delete' | 'settings'>
  gate: Pick<CommandGate, 'guard'>
  run(argv: string[], cwd: string, signal: AbortSignal): Promise<string>
}
/** Produces host-owned test receipts and checks their code/request identity before a ready report. */
export class Verification {
  private readonly checking = new Set<string>()
  constructor(private readonly host: Host) {}
  get enabled(): boolean { return !!this.host.store.settings().executor.verify.trim() }
  private contract(id: string): string {
    const ticket = this.ticket(id)
    return hash({ assignment: runningAssignment(ticket)!.id, mandate: ticket.mandate, cwd: ticket.execution!.directory,
      command: this.host.store.settings().executor.verify,
      inputs: ticket.inputs.map(input => ({ id: input.id, kind: input.kind,
        ...input.kind === 'text' || input.kind === 'note' ? { text: input.text } : {},
        ...input.kind === 'trigger' ? { triggerId: input.triggerId, note: input.note } : {} })) })
  }
  private ticket(id: string): Ticket {
    const ticket = this.host.store.tickets.get(id)
    if (!ticket || !liveTicket(ticket) || !runningAssignment(ticket) || !ticket.execution?.directory)
      throw new Error('Verification requires a live worker assignment and workspace')
    return ticket
  }
  private async fingerprint(id: string, signal: AbortSignal): Promise<string> {
    const ticket = this.ticket(id), contract = this.contract(id)
    const cwd = ticket.execution!.directory
    const git = (...args: string[]) => this.host.run(['git', ...args], cwd, signal)
    const head = (await git('rev-parse', 'HEAD')).trim()
    if (!/^[a-f0-9]{40,64}$/.test(head)) throw new Error('Verification requires a readable Git HEAD')
    const paths = (await git('ls-files', '-z', '--cached', '--others', '--exclude-standard')).split('\0').filter(Boolean)
    const deleted = new Set((await git('ls-files', '-z', '--deleted')).split('\0'))
    const files = [...new Set(paths)].filter(path => !deleted.has(path)).sort()
    if (files.length > 10_000) throw new Error('Verification snapshot exceeds 10000 files; use a smaller workspace')
    const objects: string[] = []
    for (let start = 0; start < files.length; start += 32)
      objects.push(await git('hash-object', '--no-filters', '--', ...files.slice(start, start + 32)))
    if (contract !== this.contract(id)) throw new Error('Verification request changed while inspecting the repository')
    return hash({ contract, head, files, objects })
  }
  async run(id: string, signal: AbortSignal): Promise<{ verified: true; checkedAt: string }> {
    if (!this.enabled) throw new Error('No operator verification command is configured')
    if (this.checking.has(id)) throw new Error('Verification is already running for this ticket')
    this.checking.add(id)
    this.host.store.delete(receiptKey(id))
    try {
      const bounded = AbortSignal.any([signal, AbortSignal.timeout(5 * 60_000)])
      const before = await this.fingerprint(id, bounded), ticket = this.ticket(id)
      const command = this.host.store.settings().executor.verify
      const gate = await this.host.gate.guard(id, process.platform === 'win32' ? 'pwsh' : 'bash', { command })
      if (gate.kind === 'deny') throw new Error(gate.reason)
      await this.host.run([...commandShell(), command], ticket.execution!.directory, bounded)
      const after = await this.fingerprint(id, bounded)
      if (before !== after) throw new Error('Repository, assignment, request or verification command changed during checks; run verification again')
      bounded.throwIfAborted()
      const checkedAt = new Date().toISOString()
      this.host.store.set(receiptKey(id), { fingerprint: after, checkedAt })
      return { verified: true, checkedAt }
    } finally { this.checking.delete(id) }
  }
  async ready(id: string, signal: AbortSignal): Promise<(() => void) | undefined> {
    if (!this.enabled) return
    if (this.checking.has(id)) throw new Error('Verification is still running')
    const contract = this.contract(id)
    const receipt = this.host.store.get(receiptKey(id))
    if (!receipt || receipt.fingerprint !== await this.fingerprint(id, signal))
      throw new Error('Run orchestrator_verify successfully for the current assignment, request and code before reporting ready')
    return () => {
      if (contract !== this.contract(id) || this.host.store.get(receiptKey(id))?.fingerprint !== receipt.fingerprint)
        throw new Error('Verification changed before the ready report was committed')
    }
  }
}
