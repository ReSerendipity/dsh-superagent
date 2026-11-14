/**
 * The product red line as regression tests: a main Session never regains file writes, the web or subagents,
 * and an Executor Session keeps its full work surface. Two layers enforce this - the tool allow lists in
 * `Sessions` and the agent presets in `cordis.patch.yml` - and widening either one must fail a test here.
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { MASTER_TOOLS, WORK_TOOLS } from '../src/app/sessions.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const presetSlice = (id: string): string => {
  const patch = readFileSync(join(root, 'cordis.patch.yml'), 'utf8')
  const order = ['dsh-superagent-worker-preset', 'dsh-superagent-router-preset']
  const start = patch.indexOf(id)
  expect(start, id).toBeGreaterThan(-1)
  const nextId = order.find(candidate => candidate !== id && patch.indexOf(candidate) > start)
  return patch.slice(start, nextId === undefined ? undefined : patch.indexOf(nextId))
}
/** The tools a preset's plugin rows carry, by their `tool-*` ids. */
const presetTools = (slice: string): string[] => [...slice.matchAll(/- id: (tool-[\w-]+)/g)].map(match => match[1]!)

it('keeps every write, web and delegation tool out of the main Session allow list', () => {
  const forbidden = ['write', 'edit', 'web_search', 'web_fetch', 'todo_write', 'subagent', 'list_subagent_models',
    'send_message', 'list_agents', 'interrupt_agent']
  expect(MASTER_TOOLS.filter(tool => forbidden.includes(tool))).toEqual([])
  // The allow list names only DSH built-ins the profile really has, so it must stay a subset of the profile's
  // own surface, which is where the preset assertions below carry the rest of the guarantee.
  expect(new Set(MASTER_TOOLS).size).toBe(MASTER_TOOLS.length)
})

it('keeps the Executor allow list at the full work surface, which is the design, not a sandbox', () => {
  for (const required of ['write', 'edit', 'bash', 'pwsh', 'web_search', 'web_fetch', 'subagent']) {
    expect(WORK_TOOLS, required).toContain(required)
  }
})

it('keeps the router preset file-locked and free of web, todo and subagent tools', () => {
  const router = presetSlice('dsh-superagent-router-preset')
  expect(router).toContain('id: dsh-superagent-router')
  // File writes are off at the DSH layer, not only masked by the allow list.
  expect(router).toContain('write: false')
  expect(router).toContain('edit: false')
  const tools = presetTools(router)
  expect(tools, 'no web/todo/subagent tools').toEqual(tools.filter(tool => !['tool-web', 'tool-todo', 'tool-subagent', 'tool-subagent-control'].includes(tool)))
  expect(tools).toContain('tool-fs')
})

it('keeps the worker preset at the full work surface: file writes, web, todo and subagents all present', () => {
  const worker = presetSlice('dsh-superagent-worker-preset')
  const tools = presetTools(worker)
  for (const required of ['tool-fs', 'tool-web', 'tool-todo', 'tool-subagent']) {
    expect(tools, required).toContain(required)
  }
  // The worker's tool-fs must not be file-locked the way the router's is.
  expect(worker).not.toContain('write: false')
  expect(worker).not.toContain('edit: false')
})
