/** The right-pane tab: the tickets a chief-of-staff chat dispatched, as searchable cards with per-task actions. */
import { useEffect, useState } from 'react'
import { usePoll, type Call } from './api.ts'
import type { T } from './text.ts'

/**
 * The pane brings its own stylesheet: the panel's `client.css` is injected inside its own React tree, which this
 * tab is not part of. Colors mix with `currentColor` (or the system `Canvas` pair) so cards and menus read on both
 * light and dark panels.
 */
const CSS = `
.dsh-tasks { height: 100%; overflow-y: auto; padding: 14px 14px 22px; display: flex; flex-direction: column; }
.dsh-tasks-head { display: flex; align-items: baseline; gap: 8px; }
.dsh-tasks-title { font-size: 15px; font-weight: 600; margin: 0; }
.dsh-tasks-count { font-size: 11px; opacity: .5; font-variant-numeric: tabular-nums; }
.dsh-tasks-refresh { margin-left: auto; font-size: 13px; line-height: 1; padding: 4px 6px; border-radius: 6px; cursor: pointer;
  border: 1px solid color-mix(in srgb, currentColor 18%, transparent); background: transparent; color: inherit; }
.dsh-tasks-refresh:hover { border-color: currentColor; }
.dsh-tasks-hint { font-size: 11px; opacity: .55; margin: 3px 0 4px; line-height: 1.5; }
.dsh-tasks-filters { display: flex; gap: 6px; margin: 8px 0 2px; }
.dsh-tasks-filter { font: inherit; font-size: 11px; padding: 2px 9px; border-radius: 999px; cursor: pointer; color: inherit;
  border: 1px solid color-mix(in srgb, currentColor 16%, transparent); background: transparent; }
.dsh-tasks-filter[data-active="true"] { background: color-mix(in srgb, currentColor 12%, transparent);
  border-color: color-mix(in srgb, currentColor 40%, transparent); }
.dsh-tasks-search { margin: 8px 0 2px; }
.dsh-tasks-search input { width: 100%; box-sizing: border-box; font: inherit; font-size: 12px; padding: 5px 9px;
  border-radius: 7px; border: 1px solid color-mix(in srgb, currentColor 18%, transparent); background: transparent;
  color: inherit; outline: none; }
.dsh-tasks-search input:focus { border-color: color-mix(in srgb, currentColor 45%, transparent); }
.dsh-tasks-group { font-size: 11px; font-weight: 600; opacity: .45; letter-spacing: .4px; text-transform: uppercase; margin: 14px 0 7px; }
.dsh-task { border: 1px solid color-mix(in srgb, currentColor 14%, transparent); border-radius: 9px; padding: 10px 12px;
  display: flex; flex-direction: column; gap: 6px; margin-bottom: 7px; transition: border-color .15s, background .15s; }
.dsh-task:hover { border-color: color-mix(in srgb, currentColor 30%, transparent); background: color-mix(in srgb, currentColor 4%, transparent); }
.dsh-task-top { display: flex; gap: 8px; align-items: flex-start; }
.dsh-task-name { flex: 1; font-size: 13px; line-height: 1.45; word-break: break-word; cursor: pointer; }
.dsh-task-name:hover { text-decoration: underline; }
.dsh-task-badge { font-size: 10px; padding: 1px 7px; border-radius: 999px; white-space: nowrap; border: 1px solid currentColor; }
.dsh-task-badge[data-state="completed"] { color: #1a7f45; background: color-mix(in srgb, #1a7f45 10%, transparent); }
.dsh-task-badge[data-state="working"] { color: #1a5fd0; background: color-mix(in srgb, #1a5fd0 10%, transparent); }
.dsh-task-badge[data-state="stopped"] { color: #b42318; background: color-mix(in srgb, #b42318 10%, transparent); }
.dsh-task-badge[data-state="person"] { color: #a15c00; background: color-mix(in srgb, #a15c00 10%, transparent); }
.dsh-task-preview { font-size: 12px; line-height: 1.5; opacity: .62; display: -webkit-box; -webkit-line-clamp: 2;
  -webkit-box-orient: vertical; overflow: hidden; }
.dsh-task-preview[data-expanded="true"] { display: block; -webkit-line-clamp: unset; overflow: visible; white-space: pre-wrap; }
.dsh-task-foot { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.dsh-task-time { font-size: 11px; opacity: .45; font-variant-numeric: tabular-nums; }
.dsh-task-note { font-size: 10px; opacity: .4; }
.dsh-task-link { border: 0; background: transparent; color: inherit; font: inherit; cursor: pointer; text-decoration: underline;
  text-decoration-color: color-mix(in srgb, currentColor 30%, transparent); }
.dsh-task-open { font-size: 12px; padding: 2px 9px; border-radius: 6px; cursor: pointer; font: inherit; color: inherit;
  border: 1px solid color-mix(in srgb, currentColor 22%, transparent); background: transparent; }
.dsh-task-open:hover { border-color: currentColor; }
.dsh-tasks-empty { margin-top: 20px; text-align: center; font-size: 12px; opacity: .55; line-height: 1.7; }
.dsh-tasks-empty svg { opacity: .35; margin-bottom: 8px; }
.dsh-task-menu { position: fixed; z-index: 9999; background: Canvas; color: CanvasText; min-width: 132px; padding: 4px;
  border-radius: 8px; border: 1px solid color-mix(in srgb, CanvasText 20%, transparent);
  box-shadow: 0 8px 24px rgba(0, 0, 0, .18); display: flex; flex-direction: column; }
.dsh-task-menu button { text-align: left; font: inherit; font-size: 12px; padding: 5px 9px; border: 0; border-radius: 6px;
  background: transparent; color: inherit; cursor: pointer; }
.dsh-task-menu button:hover { background: color-mix(in srgb, CanvasText 8%, transparent); }
`

/** Stages in which a ticket still has work ahead: anything else is history. */
const LIVE = new Set(['working', 'person', 'idle'])
type Filter = 'all' | 'live' | 'done'
type Item = { ticket_id: string; title: string; state: string; preview?: string; ended?: { at: string }
  worker_session: string; chat_session: string; report_state?: string | null }

function EmptyIcon() {
  return <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" /><path d="M7.5 9h9M7.5 12.5h6M7.5 16h4" />
  </svg>
}

export function TasksPane({ t, call, openSession }: {
  t: T; call: Call; openSession: (sessionId: string) => Promise<void>
}) {
  const { data, error, reload } = usePoll(() => call('GET chatRouter/tasks'), [])
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const [menu, setMenu] = useState<{ x: number; y: number; item: Item } | null>(null)
  const [updatedAt, setUpdatedAt] = useState('')
  const [failure, setFailure] = useState<string | null>(null)
  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    window.addEventListener('click', close)
    window.addEventListener('scroll', close, true)
    return () => { window.removeEventListener('click', close); window.removeEventListener('scroll', close, true) }
  }, [menu])
  const all = (data?.items ?? []) as Item[]
  const needle = query.trim().toLowerCase()
  const items = needle ? all.filter(item => `${item.title} ${item.preview ?? ''}`.toLowerCase().includes(needle)) : all
  const live = items.filter(item => LIVE.has(item.state))
  const done = items.filter(item => !LIVE.has(item.state))
  const toggle = (id: string) => setExpanded(previous => {
    const next = new Set(previous)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  const refresh = () => { void reload(); setUpdatedAt(new Date().toLocaleTimeString()) }
  const act = async (route: 'POST tickets/:id/stop' | 'POST tickets/:id/retry', id: string) => {
    setMenu(null)
    try {
      await call(route, { id }); await reload()
      setFailure(null)
    } catch (error) {
      // This pane mounts beside the conversation, where no panel toast may be visible; say what failed here.
      setFailure(error instanceof Error ? error.message : String(error))
    }
  }
  const card = (item: Item) => <article key={item.ticket_id} className="dsh-task"
    onContextMenu={event => { event.preventDefault(); setMenu({ x: event.clientX, y: event.clientY, item }) }}>
    <div className="dsh-task-top">
      <span className="dsh-task-name" role="button" tabIndex={0} title={t('chatRouterExpand')}
        onClick={() => toggle(item.ticket_id)}
        onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggle(item.ticket_id) } }}>
        {item.title}
      </span>
      <span className="dsh-task-badge" data-state={item.state}>{item.state}</span>
    </div>
    {item.preview && <span className="dsh-task-preview" data-expanded={expanded.has(item.ticket_id)}>{item.preview}</span>}
    <div className="dsh-task-foot">
      {item.ended?.at && <span className="dsh-task-time">{new Date(item.ended.at).toLocaleString()}</span>}
      {item.report_state && <span className="dsh-task-note">{item.report_state}</span>}
      {item.chat_session && <button type="button" className="dsh-task-note dsh-task-link"
        onClick={() => { void openSession(item.chat_session) }}>{t('chatRouterFrom')} {item.chat_session.slice(-8)}</button>}
      <button type="button" className="dsh-task-open" onClick={() => { void openSession(item.worker_session) }}>{t('openWorkerSession')}</button>
    </div>
  </article>
  return <>
    <style>{CSS}</style>
    <div className="dsh-tasks">
      <div className="dsh-tasks-head">
        <h2 className="dsh-tasks-title">{t('chatRouterTasks')}</h2>
        {all.length > 0 && <span className="dsh-tasks-count">{live.length} / {all.length}</span>}
        <button type="button" className="dsh-tasks-refresh" title={t('chatRouterRefresh')} aria-label={t('chatRouterRefresh')}
          onClick={refresh}>⟳</button>
      </div>
      <p className="dsh-tasks-hint">{t('chatRouterTasksHint')}{updatedAt ? ` · ${t('chatRouterUpdated')} ${updatedAt}` : ''}</p>
      {all.length > 0 && <>
        <div className="dsh-tasks-filters">{([['all', 'chatRouterFilterAll'], ['live', 'chatRouterFilterLive'], ['done', 'chatRouterFilterDone']] as const).map(([value, label]) =>
          <button key={value} type="button" className="dsh-tasks-filter" data-active={filter === value}
            onClick={() => setFilter(value)}>{t(label)}</button>)}</div>
        <div className="dsh-tasks-search">
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder={t('chatRouterSearch')} aria-label={t('chatRouterSearch')} />
        </div>
      </>}
      {(error || failure) && <p className="dsh-tasks-hint" style={{ color: 'crimson' }}>{failure ?? error?.message}</p>}
      {all.length === 0
        ? <div className="dsh-tasks-empty"><EmptyIcon /><div>{t('chatRouterTasksEmpty')}</div></div>
        : items.length === 0
          ? <div className="dsh-tasks-empty"><div>{t('chatRouterNoMatch')}</div></div>
          : <>
            {filter !== 'done' && live.length > 0 && <><h3 className="dsh-tasks-group">{t('chatRouterActive')}</h3>{live.map(card)}</>}
            {filter !== 'live' && done.length > 0 && <><h3 className="dsh-tasks-group">{t('chatRouterDone')}</h3>{done.map(card)}</>}
          </>}
    </div>
    {menu && <div className="dsh-task-menu" style={{ left: menu.x, top: menu.y }} onClick={event => event.stopPropagation()}>
      <button type="button" onClick={() => { void openSession(menu.item.worker_session) }}>{t('openWorkerSession')}</button>
      <button type="button" onClick={() => { void act('POST tickets/:id/retry', menu.item.ticket_id) }}>{t('chatRouterRetry')}</button>
      <button type="button" onClick={() => { void act('POST tickets/:id/stop', menu.item.ticket_id) }}>{t('chatRouterStop')}</button>
    </div>}
  </>
}
