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

/**
 * The host's right-pane tab registry: `sidebarRightTabs` registers a tab TYPE (what the sidebar lists), and the
 * body is then mounted through the `sidebar.right.pane.tab` slot under a key equal to that type's id. Both are
 * optional host capabilities, so the shapes are declared locally instead of importing the host's types.
 */
interface SidebarTabs {
  register(definition: {
    id: string
    kind: string
    priority: 'extension'
    title: () => string
    guide: readonly { id: string; order: number; title: () => string; description?: () => string }[]
  }): () => void
}
/** A keyed slot: `register` takes `key`, and writing `id` instead makes the pane fall back to its empty state. */
interface RightPaneSlots {
  inject(name: string, generator: () => Generator<unknown, void, unknown>): void
  register(registration: { name: string; key: string; order: number }, component: () => unknown): () => void
}

// `layout` is read on demand: requiring it at activation blocked the whole entry on hosts where the layout
// service is not ready yet, which made DSH fail to boot.
type ClientContext = Context & { sessions: ISessions; layout?: ILayout }
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

export const inject = ['slots', 'locale', 'sessions', 'uiWorkspace']
/** Registers the panel, sidebar icon, and Plugin Manager config view; `configForms` is optional (without it, machine settings are read-only). */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-superagent: dictionaries')
  const t = ctx.locale.bind(NS)
  ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL_ID, locale: NS, inject: () => ({}) },
    (props: { t: T }) => <Mounted ctx={ctx} t={props.t} />))
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: PANEL_ID, order: 10, label: () => t('panel'), locale: NS }, HammerIcon))
  // A right-pane tab, like a companion plugin's chat pane: the tasks a chief-of-staff chat dispatched, listed
  // beside the conversation instead of behind the panel icon.
  const call = caller(() => messages(t))
  const openSession = async (id: string): Promise<void> => {
    try { await openKnownSession(ctx.sessions, id as SessionId, target => { ctx.uiWorkspace.openSession(target) }, new AbortController().signal) }
    catch (error) {
      // The pane's callers surface this in place; the warn keeps a breadcrumb for sessionless mounts.
      console.warn('dsh-superagent: cannot open Session', error)
      throw error
    }
  }
  // The right-pane tab: register the tab TYPE first (what the sidebar lists), then the body under the same key.
  // Without the type the sidebar has nothing to list, and with `id` instead of `key` the body is never found.
  const tabs = ctx.get('sidebarRightTabs') as SidebarTabs | undefined
  if (tabs !== undefined && typeof tabs.register === 'function') {
    const TAB_ID = 'dsh-superagent-tasks'
    const TAB_KIND = 'tasks'
    tabs.register({
      id: TAB_ID,
      kind: TAB_KIND,
      priority: 'extension',
      title: () => t('chatRouterTasks'),
      guide: [{ id: TAB_KIND, order: 400, title: () => t('chatRouterTasks'), description: () => t('chatRouterTasksHint') }],
    })
    const rightSlots = ctx.slots as unknown as RightPaneSlots
    // The sidebar may mount after this plugin: wait for the slot declaration before registering the body.
    rightSlots.inject('sidebar.right.pane.tab', function* () {
      yield rightSlots.register({ name: 'sidebar.right.pane.tab', key: TAB_ID, order: 100 },
        () => <TasksPane t={t} call={call} openSession={openSession} />)
    })
  } else {
    console.warn('[dsh-superagent] 右侧栏不可用：没有 sidebarRightTabs 服务，总管任务标签未注册')
  }
  ctx.slots.inject('plugins.row.config', () => ctx.slots.register({ name: 'plugins.row.config', key: `${ENTRY}#${ENTRY}`, locale: NS },
    (props: PluginConfigViewProps & { t: T }) => <PluginConfig t={props.t} view={props.view} form={props.form} />))
}
