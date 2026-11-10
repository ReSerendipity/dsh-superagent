/** Browser plugin entry point registering the sidebar icon, main management panel, and Plugin Manager config view. */
import { useCallback, useEffect, useRef } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { ILayout, MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { SidebarFooterActionOwnerProps, SidebarPanelIconOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { PluginConfigViewProps } from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { openKnownSession, SessionNavigationError } from '../navigation.ts'
import { caller } from './api.ts'
import { App } from './app.tsx'
import { messages } from './provider.tsx'
import { TasksPane } from './tasks-pane.tsx'
import { PluginConfig, usePageForm } from './deployment.tsx'
import { en, zh } from './locales.ts'
import type { T } from './text.ts'

// DSH 0.2.0-rc.1 added the right-pane tab slot; this bundle's devDependencies pin an older type set, so declare
// the slot here. The host renders it when the slot exists, and the registration is inert otherwise.
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'sidebar.right.pane.tab': { kind: 'list'; scope: 'root'; owner: Record<never, never> }
  }
}

type ClientContext = Context & { sessions: ISessions; layout: ILayout }
const NS = 'dshSuperagent'
const PANEL_ID = 'dsh-superagent' as MainPanelId
const ENTRY = 'dsh-superagent'

function HammerIcon({ size }: SidebarPanelIconOwnerProps) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M6 3.5h9l3.5 1.75v2.5L15 9.5H6a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1z" /><path d="M10 9.5v10.25a1.75 1.75 0 0 0 3.5 0V9.5" /><path d="M10 15.5h3.5" />
  </svg>
}

/** Mounted panel wrapper; cancels any pending Session navigation when a new one starts or the panel unmounts. */
function Mounted({ ctx, t }: { ctx: ClientContext; t: T }) {
  const pending = useRef<AbortController>(undefined)
  useEffect(() => () => { pending.current?.abort() }, [])
  const openSession = useCallback(async (id: string) => {
    pending.current?.abort()
    const request = new AbortController(); pending.current = request
    try {
      await openKnownSession(ctx.sessions, id as SessionId, target => { ctx.uiWorkspace.openSession(target) }, request.signal)
    } catch (error) {
      if (error instanceof SessionNavigationError) throw new Error(t(error.code === 'not-ready' ? 'sessionListNotReady' : 'sessionNotListed'))
      throw error
    }
  }, [ctx, t])
  const form = usePageForm(ctx.get('configForms')?.get<Record<string, unknown>>(ENTRY))
  return <App t={t} openSession={openSession} deploymentForm={form} />
}

export const inject = ['slots', 'locale', 'sessions', 'uiWorkspace', 'layout']
/** Registers the panel, sidebar icon, and Plugin Manager config view; `configForms` is optional (without it, machine settings are read-only). */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-superagent: dictionaries')
  const t = ctx.locale.bind(NS)
  ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL_ID, locale: NS, inject: () => ({}) },
    (props: { t: T }) => <Mounted ctx={ctx} t={props.t} />))
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: PANEL_ID, order: 10, label: () => t('panel'), locale: NS }, HammerIcon))
  // A shortcut at the sidebar foot: one click reaches the panel, which opens on the Execution page where the
  // chief-of-staff tasks and live tickets are, so settings and task state are one hop away instead of three.
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register(
    { name: 'sidebar.footer.action', id: 'dsh-superagent:tasks', order: 10, label: () => t('chatRouterTasks'), locale: NS },
    ({ wide }: SidebarFooterActionOwnerProps) => (
      <button type="button" title={t('chatRouterTasks')} onClick={() => { ctx.layout.selectPanel(PANEL_ID) }}
        style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', justifyContent: wide ? 'flex-start' : 'center',
          padding: wide ? '6px 8px' : 6, background: 'none', border: 0, color: 'inherit', cursor: 'pointer', font: 'inherit' }}>
        <HammerIcon size={16} active={false} />
        {wide && <span>{t('chatRouterTasks')}</span>}
      </button>),
  ))
  // A right-pane tab, like a companion plugin's chat pane: the tasks a chief-of-staff chat dispatched, listed
  // beside the conversation instead of behind the panel icon.
  const call = caller(() => messages(t))
  const openSession = async (id: string): Promise<void> => {
    try { await openKnownSession(ctx.sessions, id as SessionId, target => { ctx.uiWorkspace.openSession(target) }, new AbortController().signal) }
    catch (error) { console.warn('dsh-superagent: cannot open Session', error) }
  }
  // The right pane may mount after this plugin: wait for the slot declaration before registering, or the tab opens blank.
  ctx.slots.inject('sidebar.right.pane.tab', function* () {
    yield ctx.slots.register({ name: 'sidebar.right.pane.tab', id: 'dsh-superagent-tasks', order: 100,
      label: () => t('chatRouterTasks') }, () => <TasksPane t={t} call={call} openSession={openSession} />)
  })
  ctx.slots.inject('plugins.row.config', () => ctx.slots.register({ name: 'plugins.row.config', key: `${ENTRY}#${ENTRY}`, locale: NS },
    (props: PluginConfigViewProps & { t: T }) => <PluginConfig t={props.t} view={props.view} form={props.form} />))
}
