// @vitest-environment jsdom
// The Ticket timeline: one chrono view over messages, system events and reports.
import { expect, it } from 'vitest'
import { zh } from '../src/client/locales.ts'
import { ticketTimeline } from '../src/client/timeline.ts'
import { at, all, click, mount, usePanel } from './fixtures/panel.tsx'
import { server } from './fixtures/panel-server.ts'

usePanel()

it('orders the ticket aggregates newest first and files each entry under its group', () => {
  const entries = ticketTimeline(server.ticketDetails.t1!)
  expect(entries.map(entry => entry.kind)).toEqual(['policy', 'trigger', 'report', 'started', 'assigned', 'created', 'decision'])
  expect(entries.map(entry => entry.group)).toEqual(['event', 'message', 'report', 'event', 'event', 'event', 'event'])
  // The newest report carries the worker's own state and summary, not a re-worded copy.
  expect(entries.find(entry => entry.kind === 'report')).toMatchObject({ state: 'progress', text: 'working', number: 1 })
  // A message keeps the Trigger it came from, so the row can open the original conversation.
  expect(entries.find(entry => entry.kind === 'trigger')).toMatchObject({ link: { thread: 'feishu:oc_1:om_root', trigger: 'e2' } })
})

it('renders the timeline with localized titles, group tags and working filters', async () => {
  at({ page: 'execution', id: 't1' })
  await mount()
  const section = all('.dt-section').find(item => item.querySelector('.dt-section-name')?.textContent === zh.ticketTimeline)!
  expect(section).toBeTruthy()
  expect(section.querySelector('.dt-count')?.textContent).toBe('7')
  const rows = section.querySelectorAll('.dt-ticket-timeline-item')
  expect([...rows].map(row => row.getAttribute('data-kind')))
    .toEqual(['policy', 'trigger', 'report', 'started', 'assigned', 'created', 'decision'])
  expect([...rows].map(row => row.querySelector('.dt-ticket-timeline-time')?.getAttribute('datetime')))
    .toEqual(['2026-09-22T00:04:00Z', '2026-09-22T00:03:00Z', '2026-09-22T00:02:00Z', '2026-09-22T00:01:00Z',
      '2026-09-22T00:00:00Z', '2026-09-22T00:00:00Z', '2026-09-22T00:00:00Z'])
  expect([...rows].map(row => row.querySelector('.dt-ticket-timeline-kind')?.textContent))
    .toEqual([zh.timelineEvents, zh.timelineMessages, zh.timelineReports, zh.timelineEvents, zh.timelineEvents,
      zh.timelineEvents, zh.timelineEvents])
  expect([...rows].map(row => row.querySelector('.dt-ticket-timeline-title')?.textContent)).toEqual([
    zh.timelinePolicy, zh.timelineFromActor.replace('{actor}', 'Alice'), zh.timelineReport.replace('{state}', zh['report.progress']),
    zh.timelineStarted, zh.timelineAssigned.replace('{number}', '1'), zh.timelineCreated,
    zh.timelineDecision.replace('{outcome}', zh['decision.accept'])])
  expect(section.querySelector('.dt-ticket-timeline-item[data-kind="trigger"] .dt-tag')?.textContent).toBe(zh.inputUndelivered)

  await click(zh.timelineMessages)
  expect(section.querySelectorAll('.dt-ticket-timeline-item')).toHaveLength(1)
  expect(section.querySelector('.dt-ticket-timeline-item')?.getAttribute('data-kind')).toBe('trigger')
  await click(zh.timelineReports)
  expect(section.querySelectorAll('.dt-ticket-timeline-item')).toHaveLength(1)
  expect(section.querySelector('.dt-ticket-timeline-item')?.getAttribute('data-kind')).toBe('report')
  await click(zh.timelineEvents)
  expect(section.querySelectorAll('.dt-ticket-timeline-item')).toHaveLength(5)
  await click(zh.timelineAll)
  expect(section.querySelectorAll('.dt-ticket-timeline-item')).toHaveLength(7)
})

it('shows the recent page first and reveals earlier entries on demand', async () => {
  const detail = server.ticketDetails.t1!
  server.ticketDetails.t1 = { ...detail, inputs: Array.from({ length: 10 }, (_, index) => ({
    id: `n${index}`, kind: 'note' as const, text: `备注 ${index}`, at: `2026-09-22T01:${String(index).padStart(2, '0')}:00Z`,
    delivered: true })) }
  at({ page: 'execution', id: 't1' })
  await mount()
  const section = all('.dt-section').find(item => item.querySelector('.dt-section-name')?.textContent === zh.ticketTimeline)!
  expect(section.querySelectorAll('.dt-ticket-timeline-item')).toHaveLength(8)
  const more = section.querySelector<HTMLButtonElement>('.dt-section .dt-ticket-timeline-toggle:last-of-type')
  expect(more?.textContent).toBe(zh.timelineShowEarlier.replace('{count}', '7'))
  await click(more!)
  expect(section.querySelectorAll('.dt-ticket-timeline-item')).toHaveLength(15)
})
