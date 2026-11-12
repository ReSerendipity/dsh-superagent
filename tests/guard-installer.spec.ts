/**
 * The logon starter the installer writes: parses the emitted VBScript the way wscript would, so a quoting mistake
 * (the 2026-11 release shipped one that made every generated starter a syntax error) cannot come back unnoticed.
 * The simulation runs the emitted `echo` lines through cmd's non-block rules - carets outside quotes unescape,
 * variables expand, and everything else lands in the file verbatim - then validates the result as VBScript.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'

const lines = readFileSync(join(import.meta.dirname, '..', 'scripts', 'install-guard-startup.cmd'), 'utf8').split(/\r?\n/)
const variable = (name: string): string => {
  const line = lines.find(candidate => candidate.toLowerCase().startsWith(`set "${name.toLowerCase()}=`))
  expect(line, `set "${name}=..."`).toBeDefined()
  return line!.slice(`set "${name}=`.length).replace(/"$/, '')
}
/** What cmd emits for one `echo` line outside a block: unescape carets outside quotes, expand %VARS%, drop the redirect. */
function emitted(line: string, values: Record<string, string>): string {
  expect(line.startsWith('echo '), `the line sits outside a parenthesized block: ${line}`).toBe(true)
  let out = line.slice('echo '.length).replace(/\s*>>?\s*"%VBS%"$/, '')
  // Carets only escape outside double quotes; walk the line keeping track of the quote state.
  let result = '', quoted = false
  for (let index = 0; index < out.length; index++) {
    const character = out[index]!
    if (character === '"') { quoted = !quoted; result += character } else if (character === '^' && !quoted) { result += out[++index]! } else { result += character }
  }
  for (const [name, value] of Object.entries(values)) result = result.replaceAll(`%${name}%`, value)
  return result
}
/** Reads the argument of `sh.Run <string>, 0, False` the way VBScript scans a quoted string: "" is a literal quote. */
function runArgument(line: string): { text: string; tail: string } {
  const start = line.indexOf('sh.Run ') + 'sh.Run '.length
  expect(line[start], 'the argument opens with a quote').toBe('"')
  let text = '', index = start + 1
  for (;;) {
    expect(index, 'the string is terminated').toBeLessThan(line.length)
    if (line[index] === '"') {
      if (line[index + 1] === '"') { text += '"'; index += 2; continue }
      return { text, tail: line.slice(index + 1) }
    }
    text += line[index]; index++
  }
}

it('writes a sh.Run line whose quoting survives VBScript parsing, even for a guard path with spaces, parens and &', () => {
  const pwsh = variable('PWSH')
  expect(pwsh).toContain(' ')
  // A checkout copied out of a zip is the realistic adversarial case; the installer must survive it.
  const guard = 'C:\\repo (2)&x\\scripts\\dsh-superagent-guard.ps1'
  const run = lines.find(line => line.startsWith('echo sh.Run '))!
  const { text, tail } = runArgument(emitted(run, { PWSH: pwsh, GUARD: guard }))
  expect(tail).toBe(', 0, False')
  expect(text).toBe(`"${pwsh}" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "${guard}"`)
})

it('writes a CreateObject line with balanced parentheses', () => {
  const create = emitted(lines.find(line => line.startsWith('echo Set sh = CreateObject'))!, {})
  expect(create).toBe('Set sh = CreateObject("WScript.Shell")')
})

it('keeps the sh.Run and CreateObject echoes block-free, where a ")" in %GUARD% cannot end the block', () => {
  // Both emitting lines are unindented top-level statements; the error paths use goto instead of ( ... ) blocks.
  expect(lines.filter(line => line.startsWith('echo sh.Run '))).toHaveLength(1)
  expect(lines.filter(line => line.startsWith('echo Set sh = CreateObject'))).toHaveLength(1)
  expect(lines.filter(line => /^\s+\S/.test(line) && /%GUARD%/.test(line))).toEqual([])
})
