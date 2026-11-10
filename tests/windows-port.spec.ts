// Verifies the agent environment shims and the wrapper path on both platforms: batch shims and a batch wrapper
// through cmd.exe on Windows, `#!/bin/sh` shims and a directly spawned wrapper on POSIX.
// Run with: `pnpm vitest run tests/windows-port.spec.ts`
import { spawn } from 'node:child_process'
import { chmodSync } from 'node:fs'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { SubprocessRuntime } from '@deepseek-ai/dsh-subprocess'
import { expect, it } from 'vitest'
import { agentGhConfig, agentVariables, runAsWorker, workerBin, workerGitConfig, writeEnvironment } from '../src/infra/environment.ts'

// Every path is derived, so this contract test runs on any machine.
const stateDir = join(tmpdir(), 'dsh-superagent-windows-port')
const cli = join(tmpdir(), 'dsh-superagent-fake-tools', 'gh.exe')
const deployment = {
  stateDir,
  repository: 'acme/widgets',
  github: { cli, login: 'agent-bot', noreply: '1+agent-bot@users.noreply.github.com' },
}
const windows = process.platform === 'win32'
// The shim files `writeEnvironment` leaves behind, named as each platform resolves them: a batch file is reachable
// through PATHEXT, whereas an extensionless `#!/bin/sh` file is what a POSIX PATH lookup finds.
const shims = windows ? ['gh.cmd', 'lark-cli.cmd', 'myblocked.cmd', 'python.cmd'] : ['gh', 'lark-cli', 'myblocked', 'python']
const shim = (name: string): string => join(workerBin(stateDir), windows ? `${name}.cmd` : name)

/** A SubprocessRuntime backed by child_process, shaped as `runAsWorker` reads it. */
function runtime(): SubprocessRuntime {
  return {
    spawn(spec: { argv: string[]; cwd: string }) {
      const child = spawn(spec.argv[0]!, spec.argv.slice(1), { cwd: spec.cwd, windowsHide: true, shell: false })
      let stdout = ''
      let stderr = ''
      child.stdout.on('data', (chunk) => { stdout += String(chunk) })
      child.stderr.on('data', (chunk) => { stderr += String(chunk) })
      const done = new Promise<{ exitCode: number | null }>((resolve) => {
        child.on('error', () => resolve({ exitCode: null }))
        child.on('close', (code) => resolve({ exitCode: code }))
      })
      return {
        done,
        collected: {
          stdout: { readFrom: () => ({ text: stdout }) },
          stderr: { readFrom: () => ({ text: stderr }) },
        },
      }
    },
  } as unknown as SubprocessRuntime
}

it('writes shims that strip their own directory from PATH', async () => {
  await rm(stateDir, { recursive: true, force: true })
  await writeEnvironment(deployment, ['python', 'gh', 'git', 'myblocked'])

  const entries = await readdir(workerBin(stateDir))
  // `lark-cli` is always written: without a Feishu bot it is a shim that explains why it is unavailable.
  expect(entries.sort()).toEqual(shims)

  const gh = await readFile(shim('gh'), 'utf8')
  expect(gh.startsWith(windows ? '@echo off\r\n' : '#!/bin/sh\n')).toBe(true)
  expect(gh).toContain('Written by dsh-superagent')
  // A batch shim calls the CLI by absolute path with `%*`; a POSIX shim `exec`s it with `"$@"`.
  expect(gh).toContain(windows ? `"${cli}" %*` : `exec '${cli}' "$@"`)
  // The upstream guarantee: the shim removes itself from PATH, so a wrapper resolving `gh` by name reaches the real binary.
  expect(gh).toContain(windows ? 'set "_SELF=%~dp0"' : 'self=')
  if (windows) {
    expect(gh).toContain('set "_NEW="')
    expect(gh).toContain('endlocal & set "PATH=%_NEW:~1%"')
  } else {
    // The POSIX shim names its own directory, which is what it filters out of PATH.
    expect(gh).toContain(`self='${workerBin(stateDir)}'`)
  }

  const blocked = await readFile(shim('python'), 'utf8')
  expect(blocked).toContain('is blocked in this installation')
  expect(blocked.trimEnd().endsWith(windows ? 'exit /b 1' : 'exit 1')).toBe(true)

  // GH_CONFIG_DIR selects the agent account on Windows only; on POSIX the wrapper script names the configuration directory.
  console.log('GH_CONFIG_DIR override:', agentVariables(stateDir).GH_CONFIG_DIR)
  expect(agentVariables(stateDir).GH_CONFIG_DIR).toBe(windows ? agentGhConfig(stateDir) : undefined)
  await expect(readdir(agentGhConfig(stateDir))).resolves.toBeDefined()
  expect(await readFile(workerGitConfig(stateDir), 'utf8')).toContain('[credential "https://github.com"]')

  // Idempotency: setup re-runs this on every start, so an unrecognised marker would raise `foreignFile`.
  await writeEnvironment(deployment, ['python', 'gh', 'git', 'myblocked'])
  expect((await readdir(workerBin(stateDir))).sort()).toEqual(shims)
})

it.skipIf(!windows)('runs a batch wrapper CLI through cmd.exe and forwards its arguments intact', async () => {
  const dir = join(tmpdir(), 'dsh-superagent-wrapper-test')
  await rm(dir, { recursive: true, force: true })
  await mkdir(dir, { recursive: true })
  const wrapper = join(dir, 'gh-agent.cmd')
  // Echo the arguments back so the assertion sees exactly what the wrapper received.
  // Echo every argument in its own bracket, so an argument mangled by quoting cannot match.
  await writeFile(wrapper, '@echo off\r\necho [%1][%2][%3][%4]\r\nexit /b 0\r\n')

  const awkward = ['api', 'repos/acme/widgets', '--jq', '{name: .full_name, push: .permissions.push}']
  const output = await runAsWorker(runtime(), [wrapper, ...awkward], dir, new AbortController().signal)
  console.log('wrapper saw:', output.trim())
  // A batch parameter keeps the quotes cmd was given around an argument containing spaces; a program started
  // with `%*` still receives the unquoted value, because its own runtime strips them.
  const asBatchSees = (v: string): string => /[\s"]/.test(v) ? `"${v}"` : v
  expect(output.trim()).toBe(awkward.map((arg) => `[${asBatchSees(arg)}]`).join(''))

  // A non-zero exit of the batch file must still surface as an error carrying its stderr.
  const failing = join(dir, 'failing.cmd')
  await writeFile(failing, '@echo off\r\n1>&2 echo boom\r\nexit /b 3\r\n')
  await expect(runAsWorker(runtime(), [failing], dir, new AbortController().signal)).rejects.toThrow('boom')
})

// The POSIX twin of the batch-wrapper case: `runAsWorker` spawns the CLI itself, so no shell re-parses the arguments.
it.skipIf(windows)('runs a POSIX wrapper CLI directly and forwards its arguments intact', async () => {
  const dir = join(tmpdir(), 'dsh-superagent-wrapper-test')
  await rm(dir, { recursive: true, force: true })
  await mkdir(dir, { recursive: true })
  const wrapper = join(dir, 'gh-agent')
  // Echo every argument in its own bracket, so an argument mangled by quoting cannot match.
  await writeFile(wrapper, '#!/bin/sh\nprintf \'[%s][%s][%s][%s]\\n\' "$1" "$2" "$3" "$4"\n')
  chmodSync(wrapper, 0o755)

  const awkward = ['api', 'repos/acme/widgets', '--jq', '{name: .full_name, push: .permissions.push}']
  const output = await runAsWorker(runtime(), [wrapper, ...awkward], dir, new AbortController().signal)
  console.log('wrapper saw:', output.trim())
  // A directly spawned program receives each argument exactly as given: Node quotes it, and no shell re-parses it.
  expect(output.trim()).toBe(awkward.map((arg) => `[${arg}]`).join(''))

  // A non-zero exit of the wrapper must still surface as an error carrying its stderr.
  const failing = join(dir, 'failing')
  await writeFile(failing, '#!/bin/sh\nprintf \'boom\\n\' >&2\nexit 3\n')
  chmodSync(failing, 0o755)
  await expect(runAsWorker(runtime(), [failing], dir, new AbortController().signal)).rejects.toThrow('boom')
})
