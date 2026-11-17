// @vitest-environment jsdom
// The team board: roles, their tickets, and the unassigned lane.
import { expect, it } from 'vitest'
import { zh } from '../src/client/locales.ts'
import { usePanel, mount, all, click, tab, type } from './fixtures/panel.tsx'
import { server } from './fixtures/panel-server.ts'

usePanel()

it('opens the team board from its tab with a card per role, its tickets, and the unassigned lane', async () => {
  await mount()
  await click(zh['tab.team'])
  expect(tab(zh['tab.team']).getAttribute('aria-selected')).toBe('true')
  expect(all('.dt-team-card')).toHaveLength(1)
  expect(all('.dt-team-card h3').map(title => title.textContent)).toEqual(['评审A'])
  // A model left null is stated as the inherited Executor model, not as a blank.
  expect(all('.dt-team-model').map(model => model.textContent)).toEqual([zh.teamInheritModel])
  expect(all('.dt-team-card .dt-team-ticket')).toHaveLength(2)
  expect(all('.dt-team-card .dt-state-badge').map(badge => badge.textContent)).toEqual([zh['stage.working'], zh['outcome.completed']])
  expect(all('.dt-team-lane .dt-team-ticket')).toHaveLength(1)
  expect(document.querySelector('.dt-team-lane-title')?.textContent).toContain(zh.teamUnassignedTitle)
  // Metrics come from the server's totals, not from the eight tickets a card may show.
  expect(all('.dt-stat-value').map(value => value.textContent)).toEqual(['1', '2', '1', '1'])
})

it('narrows role cards by status and search, and points an empty roster at settings', async () => {
  await mount()
  await click(zh['tab.team'])
  await click(zh.teamFilterDone)
  expect(all('.dt-team-card .dt-team-ticket')).toHaveLength(1)
  expect(document.querySelector('.dt-team-card .dt-team-ticket .dt-state-badge')?.textContent).toBe(zh['outcome.completed'])
  await click(zh.teamFilterAll)
  const input = document.querySelector<HTMLInputElement>('.dt-team-search')!
  await type(input, '团队工单 t2')
  expect(all('.dt-team-card .dt-team-ticket')).toHaveLength(1)
  expect(all('.dt-team-card .dt-team-ticket-title').map(title => title.textContent)).toEqual(['团队工单 t2'])
})

it('shows the three-step guide, not a blank grid, when the roster is empty', async () => {
  server.team = { ...server.team, roles: [], unassigned: [], unassigned_total: 0, hidden: 0,
    totals: { roles: 0, live: 0, done: 0, unassigned: 0 } }
  await mount()
  await click(zh['tab.team'])
  expect(all('.dt-team-card')).toHaveLength(0)
  expect(document.querySelector('.dt-empty h3')?.textContent).toBe(zh.teamEmptyTitle)
  expect(all('.dt-empty-steps li').map(step => step.textContent)).toEqual(['1在设置里打开总管模式', '2添加角色，写清职责与边界', '3在主对话里派单，并指定角色'])
  expect(all('.dt-empty .dt-btn').map(button => button.textContent)).toEqual([zh.teamEmptyAction])
})
