/** The right-pane tab: the tickets a chief-of-staff chat dispatched, each one click from its worker Session. */
import { usePoll, type Call } from './api.ts'
import type { T } from './text.ts'

export function TasksPane({ t, call, openSession }: {
  t: T; call: Call; openSession: (sessionId: string) => Promise<void>
}) {
  const { data, error } = usePoll(() => call('GET chatRouter/tasks'), [])
  return <div className="dt-pane">
    <h2 className="dt-block-title">{t('chatRouterTasks')}</h2>
    {error && <p className="dt-error">{error.message}</p>}
    {data?.items.length
      ? <ul className="dt-list">{data.items.map(item => <li key={item.ticket_id} className="dt-row-meta">
        <span className="dt-status-text">{item.title}</span>
        <span className="dt-count">{item.state}</span>
        <button type="button" className="dt-link" onClick={() => { void openSession(item.worker_session) }}>
          {t('openWorkerSession')}
        </button>
      </li>)}</ul>
      : <p className="dt-hint">{t('chatRouterTasksEmpty')}</p>}
  </div>
}
