/**
 * Append-only audit of command-policy decisions.
 *
 * A record-only policy is only worth having if the commands it judged can be read back, so every worker shell call
 * the Executor observes is written here with the decision the rules produced and what actually happened. The file
 * lives under the state directory (never in a ticket worktree), is capped by rotation, and a write failure must never
 * affect the command it describes.
 */
import { appendFile, mkdir, readFile, rename, rm, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { CommandDecision } from '../command-policy.ts'

export interface CommandAuditEntry {
  at: string
  /** The ticket whose worker ran the command, when the event came from one. */
  ticket?: string
  /** The tool that carried the command (`bash`, `pwsh`). */
  tool: string
  /** The command line as the model wrote it, truncated before storage. */
  command: string
  argv: readonly string[]
  decision: CommandDecision
  enforced: CommandDecision
  rule?: string
  reason?: string
}

/** The audit file of one instance, beside the other state files. */
export const commandAuditFile = (stateDir: string): string => join(stateDir, 'command-audit.jsonl')

/** Append-only JSONL record of command-policy decisions, rotated to one sibling at a size cap. */
export class CommandAudit {
  /**
   * @param file - the JSONL file to append to.
   * @param maxBytes - the size at which the file is rotated to a single `.1` sibling, so growth stays bounded.
   */
  constructor(private readonly file: string, private readonly maxBytes = 1 << 20) {}

  /** Appends one entry, rotating first when the file is already at its cap. */
  async append(entry: CommandAuditEntry): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true })
    await this.rotateIfNeeded()
    await appendFile(this.file, `${JSON.stringify(entry)}\n`, 'utf8')
  }

  /** The most recent entries, oldest first. Unreadable lines are skipped rather than failing a panel read. */
  async recent(limit = 20): Promise<CommandAuditEntry[]> {
    const text = await readFile(this.file, 'utf8').catch(() => '')
    const lines = text.split('\n').filter(Boolean).slice(-Math.max(1, limit))
    return lines.flatMap(line => {
      try { return [JSON.parse(line) as CommandAuditEntry] } catch { return [] }
    })
  }

  private async rotateIfNeeded(): Promise<void> {
    const size = await stat(this.file).then(info => info.size).catch(() => 0)
    if (size < this.maxBytes) return
    // Windows refuses a rename onto an existing file, so the sibling is removed first; a failure leaves the audit
    // readable and simply lets the file grow one entry further.
    await rm(`${this.file}.1`, { force: true }).catch(() => {})
    await rename(this.file, `${this.file}.1`).catch(() => {})
  }
}
