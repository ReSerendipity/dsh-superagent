// The state-directory lock is what keeps one backend per state directory, and its failure mode is
// silent: a lock left behind by a dead Host makes the next Host's plugin entry inactive, so the
// client bundle still loads while `/orchestrator` never registers and the panel gets the static
// fallback's 404. These tests pin the reclaim rule: a dead holder's lock is taken at once, a live
// holder's lock still refuses the acquisition.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, expect, it, vi } from 'vitest'
import { lockSync } from 'proper-lockfile'
import { STATE_LOCK_OWNER_FILE, acquireStateLock } from '../src/app/state-lock.ts'

// The retry tests script `lockSync`'s failures; every other test keeps the real implementation. The factory
// delegates through a hoisted holder to the real function, so the mockOnce failures fall back to it.
const real = vi.hoisted(() => ({ lockSync: undefined as unknown as (...args: Parameters<typeof lockSync>) => ReturnType<typeof lockSync> }))
vi.mock('proper-lockfile', async importOriginal => {
  const actual = await importOriginal<typeof import('proper-lockfile')>()
  real.lockSync = actual.lockSync
  return { ...actual, lockSync: vi.fn((...args: Parameters<typeof lockSync>) => real.lockSync(...args)) }
})

const ROOT = mkdtempSync(join(tmpdir(), 'dsh-state-lock-'))
afterAll(() => { rmSync(ROOT, { recursive: true, force: true }) })

const stateDirOf = (name: string): string => {
  const dir = join(ROOT, name)
  mkdirSync(dir, { recursive: true })
  return dir
}
/** A pid that has already exited, so liveness checks report it dead. */
const deadPid = (): number => spawnSync(process.execPath, ['-e', ''], { stdio: 'ignore' }).pid as number
/** What a Host killed mid-run leaves: a fresh lock directory and no release. */
const leaveLock = (stateDir: string): void => { mkdirSync(`${stateDir}.lock`) }

it('reclaims a lock left by a dead holder without waiting out the stale window', () => {
  const stateDir = stateDirOf('dead-holder')
  leaveLock(stateDir)
  writeFileSync(join(stateDir, 'instance-status.json'), JSON.stringify({ pid: deadPid() }))
  const release = acquireStateLock(stateDir)
  expect(existsSync(`${stateDir}.lock`)).toBe(true)
  release()
  expect(existsSync(`${stateDir}.lock`)).toBe(false)
})

it('keeps a lock held by a live instance', () => {
  const stateDir = stateDirOf('live-holder')
  leaveLock(stateDir)
  writeFileSync(join(stateDir, STATE_LOCK_OWNER_FILE), JSON.stringify({ pid: process.pid }))
  let code: unknown
  try {
    acquireStateLock(stateDir)
  } catch (error) {
    code = (error as { code?: unknown }).code
  }
  expect(code).toBe('ELOCKED')
  expect(existsSync(`${stateDir}.lock`)).toBe(true)
})

it('records the holder while it is held and clears both when released', () => {
  const stateDir = stateDirOf('free')
  const release = acquireStateLock(stateDir)
  const owner = JSON.parse(readFileSync(join(stateDir, STATE_LOCK_OWNER_FILE), 'utf8')) as { pid: number }
  expect(owner.pid).toBe(process.pid)
  release()
  expect(existsSync(`${stateDir}.lock`)).toBe(false)
  expect(existsSync(join(stateDir, STATE_LOCK_OWNER_FILE))).toBe(false)
})

it('reclaims again when the process that won the first reclaim is itself gone, and holds the lock', async () => {
  const stateDir = stateDirOf('reclaim-retry')
  leaveLock(stateDir)
  // The owner record and the instance-status fallback both name a dead pid. The first reclaim's removeOwner
  // wipes the owner record, so the second dead-holder check reads the fallback - the way a real dead Host
  // leaves both files. The scripted failures stand for a second process winning the race and dying too.
  writeFileSync(join(stateDir, STATE_LOCK_OWNER_FILE), JSON.stringify({ pid: deadPid() }))
  writeFileSync(join(stateDir, 'instance-status.json'), JSON.stringify({ pid: deadPid() }))
  const locked = new Error('another process holds this lock')
  Object.assign(locked, { code: 'ELOCKED' })
  const calls = vi.mocked(lockSync)
  calls.mockImplementationOnce(() => { throw locked }).mockImplementationOnce(() => { throw locked })
  try {
    const release = acquireStateLock(stateDir)
    release()
    expect(existsSync(`${stateDir}.lock`)).toBe(false)
  } finally { calls.mockReset() }
})

it('reports the original ELOCKED when a live process won the race, without a third attempt', () => {
  const stateDir = stateDirOf('reclaim-live-winner')
  leaveLock(stateDir)
  // The first attempt reads a dead holder (owner record only, no instance-status fallback). The scripted
  // second failure stands for a live winner that took the lock meanwhile and wrote its own record, so the
  // retry's dead-holder check reads a live pid, gives up, and surfaces the acquisition's original error.
  writeFileSync(join(stateDir, STATE_LOCK_OWNER_FILE), JSON.stringify({ pid: deadPid() }))
  const locked = new Error('another process holds this lock')
  Object.assign(locked, { code: 'ELOCKED' })
  const calls = vi.mocked(lockSync)
  calls.mockImplementationOnce(() => { throw locked }).mockImplementationOnce(() => {
    writeFileSync(join(stateDir, STATE_LOCK_OWNER_FILE), JSON.stringify({ pid: process.pid }))
    throw locked
  })
  try {
    let code: unknown
    try { acquireStateLock(stateDir) } catch (error) { code = (error as { code?: unknown }).code }
    expect(code).toBe('ELOCKED')
    expect(calls).toHaveBeenCalledTimes(2)
    // The rm-based reclaim destroyed the lock directory on the first attempt; in a real race the winner
    // would have re-created it, which is the sub-millisecond TOCTOU this bounded retry already accepts.
    expect(existsSync(`${stateDir}.lock`)).toBe(false)
  } finally {
    calls.mockReset()
    rmSync(`${stateDir}.lock`, { recursive: true, force: true })
  }
})
