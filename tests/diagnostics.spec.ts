import { expect, it } from 'vitest'
import type { Ticket } from '../src/core/index.ts'
import { ticketDiagnostic } from '../src/app/diagnostics.ts'

it('exports workflow facts without copying user text, paths, credentials, identifiers or future fields', () => {
  const privateValue = 'PRIVATE_CANARY_DO_NOT_EXPORT'
  const ticket = {
    id: privateValue, title: privateValue, mandate: { text: privateValue }, channels: [{ address: privateValue }],
    inputs: [{ id: privateValue, text: privateValue }], undelivered: [privateValue],
    attention: { question: privateValue }, delivery: { error: privateValue },
    execution: { directory: privateValue }, future: privateValue,
    assignments: [{ id: privateValue, state: 'running', startedAt: privateValue, idleAt: privateValue,
      endedReason: privateValue, report: { state: 'blocked', summary: privateValue, at: privateValue }, future: privateValue }],
  } as unknown as Ticket
  const result = ticketDiagnostic(ticket)
  expect(JSON.stringify(result)).not.toContain(privateValue)
  expect(result).toEqual({ schema: 'dsh-superagent-diagnostic/v1', ticket: expect.stringMatching(/^[a-f0-9]{16}$/),
    ended: false, outcome: null, attention: true, deliveryFailed: true, inputCount: 1, undeliveredCount: 1, channelCount: 1,
    assignments: [{ id: result.ticket, state: 'running', report: 'blocked', started: true, ended: false, idle: true }] })
  expect(ticketDiagnostic(ticket)).toEqual(result)
})
