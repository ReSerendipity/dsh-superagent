/** The main-panel team board: configured roles, their tickets, and the dispatches that named no role. */
import { useState } from 'react'
import type { TeamBoardView } from '../app/views/team.ts'
import { usePoll } from './api.ts'
import { Button, Icon } from './controls.tsx'
import { usePanel } from './provider.tsx'
import { settingsRoute } from './route.ts'
import { fullTime, ticketStateLabel, ticketTone, when } from './text.ts'
import { Hint, LoadState, Section, When } from './widgets.tsx'

type Board = TeamBoardView
type RoleCard = Board['roles'][number]
type TeamTicket = Board['unassigned'][number]
type Filter = 'all' | 'live' | 'done'

/** One metric card: a big number a person can act on, linked to the page that lists its tickets. */
function Metric({ label, value, onClick }: { label: string; value: number; onClick?: () => void }) {
  return <span className="dt-stat">
    <span className="dt-stat-label">{label}</span>
    {onClick ? <button type="button" className="dt-textlink dt-stat-value" onClick={onClick}>{value}</button>
      : <span className="dt-stat-value">{value}</span>}
  </span>
}

/** A ticket row inside a role card: state, title, and when it last moved; the whole row opens the ticket. */
function TicketRow({ item, onOpen }: { item: TeamTicket; onOpen: () => void }) {
  const { t } = usePanel()
  const tone = ticketTone(item.state)
  const label = ticketStateLabel(item.state)
  const at = item.ended?.at ?? item.updated_at
  return <button type="button" className="dt-team-ticket" onClick={onOpen} title={t('teamOpenTicket')}
    aria-label={`${item.title} · ${label ? t(label) : item.state}`}>
    <span className="dt-team-dot" data-tone={tone} aria-hidden />
    <span className="dt-team-ticket-title">{item.title}</span>
    <span className="dt-state-badge" data-tone={tone}>{label ? t(label) : item.state}</span>
    <span className="dt-team-ticket-time" title={fullTime(at, t('lang'))}>{when(at, t('lang'))}</span>
  </button>
}

/** Empty roster: the three moves that turn roles on, with the first one one click away. */
function EmptyBoard() {
  const { t, navigate } = usePanel()
  return <div className="dt-empty">
    <span className="dt-empty-icon"><Icon name="user" size={22} /></span>
    <h3>{t('teamEmptyTitle')}</h3>
    <p>{t('teamEmptyBody')}</p>
    <ol className="dt-empty-steps">
      {[t('teamEmptyStep1'), t('teamEmptyStep2'), t('teamEmptyStep3')].map((step, index) =>
        <li key={index}><span className="dt-empty-num">{index + 1}</span>{step}</li>)}
    </ol>
    <Button variant="primary" size="sm" icon={<Icon name="settings" size={14} />}
      onClick={() => navigate(settingsRoute('chatRouter'))}>{t('teamEmptyAction')}</Button>
  </div>
}

export function TeamPage() {
  const { t, call, navigate } = usePanel()
  const { data, error, reload } = usePoll(() => call('GET team/board'), [])
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  if (!data) return <LoadState error={error} loading />
  const needle = query.trim().toLowerCase()
  const matchTicket = (item: TeamTicket) => `${item.title} ${item.preview ?? ''}`.toLowerCase().includes(needle)
  const matchStatus = (item: TeamTicket) => filter === 'all' || (filter === 'live' ? item.ended === undefined : item.ended !== undefined)
  const roleText = (role: RoleCard) => `${role.name} ${role.id} ${role.instruction}`.toLowerCase()
  const visibleRoles = data.roles.map(role => ({ role, tickets: role.tickets.filter(item => matchStatus(item) && matchTicket(item)) }))
    .filter(({ role, tickets }) => filter === 'all'
      ? tickets.length > 0 || (needle ? roleText(role).includes(needle) : role.total === 0)
      : tickets.length > 0)
  const unassigned = data.unassigned.filter(item => matchStatus(item) && matchTicket(item))
  const openTicket = (id: string) => navigate({ page: 'execution', id })
  const chip = (value: Filter, label: string) => <button key={value} type="button" className="dt-pill"
    data-active={filter === value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>
  return <>
    {error && <LoadState error={error} loading={false} />}
    <Section title={t('teamTitle')} count={data.roles.length} icon="user" action={<div className="dt-toolbar">
      <Button variant="outline" size="sm" icon={<Icon name="settings" size={14} />}
        onClick={() => navigate(settingsRoute('chatRouter'))}>{t('teamConfigure')}</Button>
      <Button variant="ghost" size="sm" onClick={() => navigate({ page: 'execution' })}>{t('teamAllTickets')}</Button>
    </div>}>
      <Hint>{t('teamHint')}</Hint>
      {!data.enabled && <div className="dt-notice" data-tone="warning" role="status">{t('teamDisabled')}</div>}
      <div className="dt-stats">
        <Metric label={t('teamMetricRoles')} value={data.totals.roles} />
        <Metric label={t('teamMetricLive')} value={data.totals.live} onClick={() => navigate({ page: 'execution', query: { filter: 'open' } })} />
        <Metric label={t('teamMetricDone')} value={data.totals.done} onClick={() => navigate({ page: 'execution', query: { filter: 'ended' } })} />
        <Metric label={t('teamMetricUnassigned')} value={data.totals.unassigned} />
      </div>
      {data.roles.length > 0 && <div className="dt-team-tools">
        <input className="dt-input dt-team-search" value={query} onChange={event => setQuery(event.target.value)}
          placeholder={t('teamSearch')} aria-label={t('teamSearch')} />
        <div className="dt-team-filters" role="group" aria-label={t('teamSearch')}>
          {chip('all', t('teamFilterAll'))}{chip('live', t('teamFilterLive'))}{chip('done', t('teamFilterDone'))}
        </div>
        <Button variant="ghost" size="sm" icon={<Icon name="refresh" size={14} />}
          onClick={() => { void reload().catch(() => {}) }}>{t('chatRouterRefresh')}</Button>
      </div>}
      {data.roles.some(role => role.total > role.tickets.length) && <p className="dt-team-note">
        {t('teamSearchLimit', { shown: Math.max(...data.roles.map(role => role.tickets.length)) })}</p>}
      {data.roles.length === 0
        ? <EmptyBoard />
        : visibleRoles.length === 0 && unassigned.length === 0
          ? <div className="dt-empty"><h3>{t('teamNoMatch')}</h3></div>
          : <>
            {visibleRoles.length > 0 && <div className="dt-team-grid">{visibleRoles.map(({ role, tickets }) =>
              <article className="dt-team-card" key={role.id} aria-labelledby={`dt-team-role-${role.id}`}>
                <header className="dt-team-head">
                  <span className="dt-team-avatar" aria-hidden>{role.name.trim().charAt(0).toUpperCase()}</span>
                  <div className="dt-team-id">
                    <h3 id={`dt-team-role-${role.id}`}>{role.name}</h3>
                    <span className="dt-team-slug">{role.id}</span>
                  </div>
                  <span className="dt-team-model" title={role.model ? `${role.model.provider}/${role.model.model}` : undefined}>
                    {role.model ? `${role.model.provider}/${role.model.model}` : t('teamInheritModel')}
                  </span>
                </header>
                <p className="dt-team-instruction" title={role.instruction}>{role.instruction}</p>
                <div className="dt-team-meta">
                  <span className="dt-team-live">{t('teamMetricLive')} {role.live}</span>
                  <span>{t('teamMetricDone')} {role.done}</span>
                  <span>{t('teamRoleTickets', { total: role.total })}</span>
                  {role.total > role.tickets.length && <span>{t('teamShowing', { shown: role.tickets.length })}</span>}
                  {role.last_at && <span className="dt-team-last">{t('teamRoleRecent')} <When at={role.last_at} /></span>}
                </div>
                {tickets.length > 0 ? <div className="dt-team-tickets">{tickets.map(item =>
                  <TicketRow key={item.ticket_id} item={item} onOpen={() => openTicket(item.ticket_id)} />)}</div>
                  : <p className="dt-team-note">{role.total === 0 ? t('teamNoTickets') : t('teamNoMatchTickets')}</p>}
              </article>)}
            </div>}
          </>}
      {data.unassigned_total > 0 && unassigned.length > 0 && <div className="dt-team-lane">
        <h3 className="dt-team-lane-title">{t('teamUnassignedTitle')} <span className="dt-count">{data.unassigned_total}</span></h3>
        <Hint>{t('teamUnassignedHint')}</Hint>
        <div className="dt-team-tickets">{unassigned.map(item =>
          <TicketRow key={item.ticket_id} item={item} onOpen={() => openTicket(item.ticket_id)} />)}</div>
      </div>}
      {data.hidden > 0 && <Hint>{t('teamHidden', { count: data.hidden })}</Hint>}
    </Section>
  </>
}
