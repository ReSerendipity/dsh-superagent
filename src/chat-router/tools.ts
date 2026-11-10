/** Tools a chief-of-staff chat keeps after its execution tools are removed. */
import { z } from 'zod'
import { tool, type Tool } from '../app/tools/tool.ts'

/** What handing a task to the Engine produced: the ticket it created, or why nothing was created. */
export interface DispatchedTask {
  ticketId?: string
  triggerId: string
  /** `stored` means the Engine took the Trigger; `duplicate`/`filtered` mean no ticket exists for it. */
  result: 'stored' | 'duplicate' | 'filtered'
}

export interface ChatRouterToolsHost {
  /**
   * Hands one task to the Engine as an explicit Trigger and accepts it at once. It does not go through the Router
   * Session, so dispatch keeps working when that Session is unavailable; the worker still gets its own Session.
   */
  submit(title: string, request: string, context?: string): Promise<DispatchedTask>
  /** Read-only view of the shared ticket store, for the chat that dispatched the work. */
  status(): Promise<unknown>
  /** Passes a person's answer back to the worker that asked. */
  answer(ticketId: string, text: string): Promise<unknown>
}

const TaskSchema = z.object({
  title: z.string().trim().min(1).max(200).describe('A short label of the original request; do not turn it into a plan.'),
  request: z.string().trim().min(1).max(20_000).describe('The request in the person\'s own words, verbatim. Never add implementation steps, acceptance criteria or checklists.'),
  context: z.string().trim().max(4000).optional().describe('Optional background the worker needs, copied from this conversation. It is the only context the worker receives.'),
}).strict()

export function chatRouterTools(host: ChatRouterToolsHost): Tool[] {
  return [
    tool({
      name: 'chat_dispatch',
      description: 'Dispatch one or more independent tasks to isolated worker sessions. You must call this for every task; you cannot do the work yourself. Each task becomes its own ticket with its own conversation, directory and context. Return the ticket files to the person as short cards.',
      schema: z.object({ tasks: z.array(TaskSchema).min(1).max(10) }).strict(),
      execute: async ({ tasks }) => {
        const results = []
        for (const task of tasks) {
          try {
            const dispatched = await host.submit(task.title, task.request, task.context)
            // Report what actually happened: a ticket id, or the reason nothing was created. Never call a stored
            // Trigger "queued" — that reads as a live ticket when no ticket exists.
            results.push(dispatched.ticketId
              ? { title: task.title, ticket_id: dispatched.ticketId, status: 'created' }
              : { title: task.title, status: dispatched.result, reason: dispatched.result === 'duplicate'
                ? 'This exact task was already dispatched; look it up with chat_status.' : 'The Engine filtered this Trigger; no ticket was created.' })
          } catch (error) {
            results.push({ title: task.title, status: 'failed', error: error instanceof Error ? error.message : String(error) })
          }
        }
        return { results }
      },
    }),
    tool({
      name: 'chat_status',
      description: 'Read the state of tickets in the shared ticket store, including ones another main chat dispatched. Read only; it never grants execution tools.',
      schema: z.object({}).strict(),
      execute: async () => host.status(),
    }),
    tool({
      name: 'chat_answer',
      description: 'Forward the person\'s answer to a worker that asked a question, without taking over its work.',
      schema: z.object({ ticket_id: z.string().trim().min(1), text: z.string().trim().min(1).max(4000) }).strict(),
      execute: async ({ ticket_id, text }) => host.answer(ticket_id, text),
    }),
  ]
}
