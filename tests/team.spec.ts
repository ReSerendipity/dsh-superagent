import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { Store } from '../src/app/store.ts'
import { SettingsSchema } from '../src/policy.ts'
import { SourceRegistry } from '../src/sources/registry.ts'
import { teamBoard } from '../src/app/views/team.ts'
import type { Ticket } from '../src/core/index.ts'

let directory: string
let store: Store
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'dsh-superagent-team-'))
  store = new Store(join(directory, 'orchestrator.sqlite'))
})
afterEach(() => { store.close(); rmSync(directory, { recursive: true, force: true }) })
const at = (minute: number) => new Date(Date.UTC(2026, 10, 17, 0, minute)).toISOString()
const views = () => ({ store, sources: new SourceRegistry(() => store.settings()),
  links: () => ({ source: 'feishu', url: '', label: { zh: '飞书消息', en: 'Feishu message' } }) })
function dispatch(id: string, meta: Record<string, unknown>) {
  store.triggers.save({ id: `trigger-${id}`, source: 'feishu', threads: [{ source: 'feishu', id: `oc_${id}` }],
    actor: { source: 'feishu', id: 'ou_a' }, human: true, at: at(0), text: id, meta })
}
const ticket = (id: string, updatedAt: string, ended?: Ticket['ended']): Ticket => ({ id, title: `title ${id}`, decisionId: 'd',
  channels: [], undelivered: [], createdAt: updatedAt, updatedAt,
  mandate: { strength: 'explicit', policyVersion: 'v', basis: { via: 'listed' }, actor: { source: 'feishu', id: 'ou_a' }, scope: '' },
  origin: { triggerId: `trigger-${id}`, triggerIds: [`trigger-${id}`] }, assignments: [], inputs: [], ...(ended ? { ended } : {}) })
const completed = (minute: number): Ticket['ended'] => ({ at: at(minute), by: 'human', outcome: 'completed' })

it('groups every chief-of-staff dispatch by its configured role, and counts unassigned and hidden dispatches separately', () => {
  store.saveSettings(SettingsSchema.parse({ chatRouter: { enabled: true, team: { roles: [
    { id: 'reviewer', name: '评审A', instruction: '只读审查', model: null },
    { id: 'writer', name: '写作', instruction: '起草文案', model: { provider: 'p', model: 'm' } }] } } }))
  for (let index = 0; index < 10; index++) {
    const id = `review-${index}`
    dispatch(id, { dispatchedBy: 'chat-router', role: 'reviewer', roleName: '评审A', chatSession: 'chat-1' })
    store.tickets.save(ticket(id, at(index), index < 4 ? completed(index) : undefined))
  }
  dispatch('write-1', { dispatchedBy: 'chat-router', role: 'writer', roleName: '写作' })
  store.tickets.save(ticket('write-1', at(20), completed(20)))
  dispatch('plain-1', { dispatchedBy: 'chat-router', chatSession: 'chat-2' })
  dispatch('plain-2', { dispatchedBy: 'chat-router', chatSession: 'chat-2' })
  store.tickets.save(ticket('plain-1', at(21)))
  store.tickets.save(ticket('plain-2', at(22), completed(22)))
  dispatch('gone-1', { dispatchedBy: 'chat-router', role: 'gone', roleName: '已删除' })
  store.tickets.save(ticket('gone-1', at(23)))
  // A ticket nobody dispatched through a chat is ordinary queue work, not part of the team board.
  dispatch('ordinary', {})
  store.tickets.save(ticket('ordinary', at(24)))

  const board = teamBoard(views())
  expect(board.enabled).toBe(true)
  expect(board.totals).toEqual({ roles: 2, live: 7, done: 6, unassigned: 2 })
  expect(board.hidden).toBe(1)
  const reviewer = board.roles[0]!
  expect(reviewer).toMatchObject({ id: 'reviewer', name: '评审A', model: null, total: 10, live: 6, done: 4 })
  // Only the newest eight travel; the real total stays available for the card's "共 N 张".
  expect(reviewer.tickets).toHaveLength(8)
  expect(reviewer.tickets[0]).toMatchObject({ ticket_id: 'review-9', role: 'reviewer', role_name: '评审A', chat_session: 'chat-1',
    worker_session: 'worker-review-9' })
  expect(reviewer.tickets.map(item => item.ticket_id)).toEqual(['review-9', 'review-8', 'review-7', 'review-6', 'review-5', 'review-4', 'review-3', 'review-2'])
  expect(board.roles[1]).toMatchObject({ id: 'writer', model: { provider: 'p', model: 'm' }, total: 1, done: 1 })
  expect(board.roles[1]!.tickets[0]).toMatchObject({ state: 'completed', role_name: '写作' })
  expect(board.unassigned.map(item => item.ticket_id)).toEqual(['plain-2', 'plain-1'])
  expect(board.unassigned_total).toBe(2)
})

it('keeps an empty configured role as a card, so a person can see the roster without any dispatch yet', () => {
  store.saveSettings(SettingsSchema.parse({ chatRouter: { team: { roles: [{ id: 'reviewer', name: '评审A', instruction: '只读审查' }] } } }))
  const board = teamBoard(views())
  expect(board.enabled).toBe(false)
  expect(board.roles).toEqual([{ id: 'reviewer', name: '评审A', instruction: '只读审查', model: null, tickets: [], total: 0, live: 0, done: 0 }])
  expect(board.totals).toEqual({ roles: 1, live: 0, done: 0, unassigned: 0 })
})
