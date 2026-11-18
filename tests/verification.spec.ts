import { execFile, execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Verification } from '../src/executor/verification.ts'
import type { Ticket } from '../src/core/index.ts'

let cwd: string, ticket: Ticket, command: string, verification: Verification
const receipts = new Map<string, unknown>(), signal = new AbortController().signal
const gate = { guard: vi.fn(async () => ({ kind: 'allow' as const })) }
const run = vi.fn(async (argv: string[], directory: string, abort: AbortSignal) =>
  (await promisify(execFile)(argv[0]!, argv.slice(1), { cwd: directory, signal: abort, maxBuffer: 1 << 20 })).stdout)
const store = {
  tickets: { get: () => ticket }, settings: () => ({ executor: { verify: command } }),
  get: (key: string) => receipts.get(key), set: (key: string, value: unknown) => receipts.set(key, value),
  delete: (key: string) => { receipts.delete(key) },
}
const make = () => new Verification({ store: store as never, gate, run })
beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'worker-verification-'))
  const git = (...args: string[]) => execFileSync('git', ['-c', 'commit.gpgSign=false', '-c', `core.hooksPath=${join(cwd, 'no-hooks')}`, ...args], { cwd, stdio: 'pipe' })
  git('init', '-q'); git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.test')
  writeFileSync(join(cwd, 'math.cjs'), 'module.exports = (a, b) => a + b\n')
  writeFileSync(join(cwd, 'checks.cjs'), "require('node:assert/strict').equal(require('./math.cjs')(2, 3), 5)\n")
  writeFileSync(join(cwd, '.gitignore'), 'ignored\n')
  git('add', '.'); git('commit', '-qm', 'fixture')
  ticket = { id: 't1', mandate: { strength: 'explicit' }, execution: { directory: cwd },
    assignments: [{ id: 'a1', state: 'running' }], inputs: [] } as unknown as Ticket
  command = 'node checks.cjs'; receipts.clear(); run.mockClear(); gate.guard.mockReset().mockResolvedValue({ kind: 'allow' })
  verification = make()
})
afterEach(() => { rmSync(cwd, { recursive: true, force: true }); vi.restoreAllMocks() })
it('requires actual passing checks, persists a receipt, and reuses it without rerunning tests', async () => {
  await expect(verification.ready('t1', signal)).rejects.toThrow('orchestrator_verify')
  expect(await verification.run('t1', signal)).toMatchObject({ verified: true })
  const guard = await make().ready('t1', signal); guard!()
  expect(run.mock.calls.filter(([args]) => args[0] !== 'git')).toHaveLength(1)
  expect(JSON.stringify([...receipts.values()])).not.toContain(cwd)
  expect(gate.guard).toHaveBeenCalledWith('t1', expect.any(String), { command })
})
it.each(['edit', 'untracked', 'delete', 'request', 'assignment', 'command'])('invalidates a receipt after %s changes', async change => {
  await verification.run('t1', signal)
  if (change === 'edit') writeFileSync(join(cwd, 'math.cjs'), 'module.exports = () => 0\n')
  if (change === 'untracked') writeFileSync(join(cwd, 'new.cjs'), 'new input')
  if (change === 'delete') rmSync(join(cwd, 'math.cjs'))
  if (change === 'request') ticket.inputs.push({ id: 'new', kind: 'text', text: 'New acceptance requirement', at: '' })
  if (change === 'assignment') ticket.assignments[0]!.id = 'a2'
  if (change === 'command') command = 'node other-checks.cjs'
  await expect(verification.ready('t1', signal)).rejects.toThrow('orchestrator_verify')
})
it('refuses a nonzero command and clears an older passing receipt before retry', async () => {
  await verification.run('t1', signal)
  run.mockImplementationOnce(async () => { throw new Error('simulated external dependency failed') })
  await expect(verification.run('t1', signal)).rejects.toThrow('external dependency')
  await expect(verification.ready('t1', signal)).rejects.toThrow('orchestrator_verify')
  writeFileSync(join(cwd, 'math.cjs'), 'module.exports = () => 0\n')
  await expect(verification.run('t1', signal)).rejects.toThrow()
  expect(receipts.size).toBe(0)
})
it('uses the existing command gate and never dispatches a denied check', async () => {
  gate.guard.mockResolvedValueOnce({ kind: 'deny', reason: 'Fixture denied' } as never)
  await expect(verification.run('t1', signal)).rejects.toThrow('Fixture denied')
  expect(run.mock.calls.every(([args]) => args[0] === 'git')).toBe(true)
})
it('detects changes made by the check itself and never emits a passing receipt', async () => {
  command = 'node mutate.cjs'
  writeFileSync(join(cwd, 'mutate.cjs'), "require('node:fs').writeFileSync('math.cjs','module.exports = () => 0')")
  await expect(verification.run('t1', signal)).rejects.toThrow('changed during checks')
  expect(receipts.size).toBe(0)
})
it('rechecks requirements synchronously when the ready report commits', async () => {
  await verification.run('t1', signal)
  const guard = await verification.ready('t1', signal)
  ticket.inputs.push({ id: 'new', kind: 'text', text: 'Later input', at: '' })
  expect(guard).toThrow('before the ready report')
})
it('keeps defaults disabled and excludes ignored build artifacts from source identity', async () => {
  command = ''; expect(verification.enabled).toBe(false); expect(await verification.ready('t1', signal)).toBeUndefined()
  command = 'node checks.cjs'; await verification.run('t1', signal)
  writeFileSync(join(cwd, 'ignored'), 'build output')
  await expect(verification.ready('t1', signal)).resolves.toBeTypeOf('function')
})
