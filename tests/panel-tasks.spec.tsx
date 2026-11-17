// @vitest-environment jsdom
// The right-pane task list: localized states, relative time, and the role filter.
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it } from 'vitest'
import { zh } from '../src/client/locales.ts'
import { TasksPane } from '../src/client/tasks-pane.tsx'
import type { Call } from '../src/client/api.ts'
import { translator } from './fixtures/panel.tsx'

let root: Root
let container: HTMLDivElement
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})
const items = [
  { ticket_id: 't1', title: '评审 README', state: 'working', updated_at: '2026-09-22T10:00:00Z', worker_session: 'worker-t1',
    chat_session: 'chat-1', role: 'reviewer', role_name: '评审A', report_state: 'progress' },
  { ticket_id: 't2', title: '写发布说明', state: 'completed', updated_at: '2026-09-22T09:00:00Z', worker_session: 'worker-t2',
    chat_session: 'chat-1', role: 'writer', role_name: '写作', report_state: 'ready' },
  { ticket_id: 't3', title: '临时排查', state: 'person/failed', updated_at: '2026-09-22T08:00:00Z', worker_session: 'worker-t3',
    chat_session: 'chat-2', role: null, role_name: null, report_state: 'failed', dispatched: true }
]
const flush = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) }) }
async function mount() {
  container = document.createElement('div'); document.body.append(container)
  root = createRoot(container)
  const call = (async () => ({ items })) as unknown as Call
  await act(async () => { root.render(<TasksPane t={translator(zh)} call={call} openSession={async () => {}} />) })
  await flush()
}

it('shows localized states, relative times with a full-time title, and localized report states', async () => {
  await mount()
  expect([...document.querySelectorAll('.dsh-task-badge')].map(badge => badge.textContent))
    .toEqual([zh['stage.working'], zh['stage.failed'], zh['outcome.completed']])
  // No raw English state or report word survives in the cards.
  expect(document.querySelector('.dsh-task-badge')?.textContent).not.toBe('working')
  expect([...document.querySelectorAll('.dsh-task-note:not(.dsh-task-link)')].map(note => note.textContent))
    .toEqual([zh['report.progress'], zh['report.failed'], zh['report.ready']])
  const time = document.querySelector('.dsh-task-time')!
  expect(time.getAttribute('datetime')).toBe('2026-09-22T10:00:00Z')
  expect(time.getAttribute('title')).toContain('2026')
})

it('filters by role and keeps the unassigned lane separate', async () => {
  await mount()
  expect([...document.querySelectorAll('.dsh-tasks-roles button')].map(button => button.textContent))
    .toEqual([zh.chatRouterAllRoles, '评审A', '写作', zh.chatRouterUnassigned])
  const unassigned = [...document.querySelectorAll<HTMLButtonElement>('.dsh-tasks-roles button')].find(button => button.textContent === zh.chatRouterUnassigned)!
  await act(async () => { unassigned.click() })
  await flush()
  expect([...document.querySelectorAll('.dsh-task-name')].map(name => name.textContent)).toEqual(['临时排查'])
  expect([...document.querySelectorAll('.dsh-tasks-count-chip')].map(chip => chip.textContent))
    .toEqual([`${zh.chatRouterWaiting} 1`, `${zh.chatRouterBlocked} 1`, `${zh.chatRouterActive} 1`])
})

it('counts the attention buckets and links each count to an equally long list', async () => {
  await mount()
  const chip = (index: number) => [...document.querySelectorAll<HTMLButtonElement>('.dsh-tasks-count-chip')][index]!
  expect([...document.querySelectorAll('.dsh-tasks-count-chip')].map(item => item.textContent))
    .toEqual([`${zh.chatRouterWaiting} 1`, `${zh.chatRouterBlocked} 1`, `${zh.chatRouterActive} 2`])
  await act(async () => { chip(0).click() })
  await flush()
  expect([...document.querySelectorAll('.dsh-task-name')].map(name => name.textContent)).toEqual(['临时排查'])
  expect(chip(0).getAttribute('aria-pressed')).toBe('true')
  await act(async () => { chip(1).click() })
  await flush()
  expect([...document.querySelectorAll('.dsh-task-name')].map(name => name.textContent)).toEqual(['临时排查'])
  expect(chip(1).getAttribute('aria-pressed')).toBe('true')
  await act(async () => { chip(2).click() })
  await flush()
  expect([...document.querySelectorAll('.dsh-task-name')].map(name => name.textContent)).toEqual(['评审 README', '临时排查'])
  expect(chip(2).getAttribute('aria-pressed')).toBe('true')
})
