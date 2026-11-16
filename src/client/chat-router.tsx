/** Settings group for the chat chief of staff: which tools a main chat keeps, and whether work must be dispatched. */
import type { ChatRouterSettings, TeamRole } from '../chat-router/config.ts'
import { CUSTOM_TOOL_GROUPS, MAX_TEAM_ROLES } from '../chat-router/tool-groups.ts'
import { useState } from 'react'
import { Button, InfoTip, Input, SegmentedControl, Switch } from './controls.tsx'
import { SaveBar } from './draft.tsx'
import { usePanel } from './provider.tsx'
import { Field, Fields, useBlockDraft, useSettings } from './settings-kit.tsx'
import { Hint, Section } from './widgets.tsx'

export function ChatRouterSettingsPage() {
  const { t } = usePanel()
  const block = useSettings().settings.blocks.chatRouter
  const draft = useBlockDraft<ChatRouterSettings>('chatRouter', block.value, block.revision)
  const value = draft.value
  const edit = (next: Partial<ChatRouterSettings>) => draft.edit({ ...value, ...next })
  const toggleTool = (name: string, on: boolean) => edit({ tools: { ...value.tools,
    allow: on ? [...new Set([...value.tools.allow, name])] : value.tools.allow.filter(item => item !== name) } })
  const roles = value.team.roles
  const editRole = (index: number, patch: Partial<TeamRole>) => edit({ team: { ...value.team,
    roles: roles.map((role, at) => at === index ? { ...role, ...patch } : role) } })
  const addRole = () => edit({ team: { ...value.team,
    roles: [...roles, { id: `role-${roles.length + 1}`, name: '', instruction: '', model: null }] } })
  // Every field stays editable while it is typed: an incomplete row simply fails the save with the schema's message.
  // The two model boxes keep their own text until both are filled, because `model` is all-or-null in the settings: reading
  // it back from the value would blank the provider box on the next keystroke of the model box.
  const [modelText, setModelText] = useState<Record<number, { provider: string; model: string }>>({})
  const textOf = (index: number, role: TeamRole) => modelText[index] ?? { provider: role.model?.provider ?? '', model: role.model?.model ?? '' }
  const editModel = (index: number, role: TeamRole, field: 'provider' | 'model', next: string) => {
    const text = { ...textOf(index, role), [field]: next }
    setModelText(previous => ({ ...previous, [index]: text }))
    const filled = text.provider.trim() && text.model.trim()
    editRole(index, { model: filled ? { provider: text.provider, model: text.model,
      ...(role.model?.reasoningEffort ? { reasoningEffort: role.model.reasoningEffort } : {}) } : null })
  }
  const removeRoleAt = (index: number) => {
    setModelText({})
    edit({ team: { ...value.team, roles: roles.filter((_, at) => at !== index) } })
  }

  return <form className="dt-form dt-block" onSubmit={event => { void draft.submit(event) }}>
    <Fields disabled={draft.busy}>
      <h2 className="dt-block-title">{t('chatRouterTitle')}<InfoTip text={t('chatRouterIntro')} /></h2>
      <div className="dt-switch-row">
        <div className="dt-field-head">{t('chatRouterEnabled')}<InfoTip text={t('chatRouterEnabledHint')} /></div>
        <Switch checked={value.enabled} onChange={enabled => edit({ enabled })} label={t('chatRouterEnabled')} />
      </div>
      <Section title={t('chatRouterPreset')} hint={t('chatRouterPresetHint')}>
        <SegmentedControl className="dt-segmented" label={t('chatRouterPreset')} value={value.tools.preset}
          onChange={preset => edit({ tools: { ...value.tools, preset } })}
          options={(['strict', 'standard', 'custom'] as const).map(preset => ({ value: preset,
            label: t(`chatRouterPreset.${preset}`), title: t(`chatRouterPreset.${preset}Hint`) }))} />
      </Section>
      {value.tools.preset === 'custom' && <Section title={t('chatRouterCustomTools')} hint={t('chatRouterCustomToolsHint')}>
        {CUSTOM_TOOL_GROUPS.map(group => <div key={group.id} className="dt-field">
          <span className="dt-field-head">{group.label.zh}</span>
          <div>
            {group.tools.map(tool => <label key={tool} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginRight: 12 }}>
              <input type="checkbox" checked={value.tools.allow.includes(tool)}
                onChange={event => toggleTool(tool, event.target.checked)} /><code>{tool}</code>
            </label>)}
          </div>
        </div>)}
      </Section>}
      <div className="dt-switch-row">
        <div className="dt-field-head">{t('chatRouterForceDispatch')}<InfoTip text={t('chatRouterForceDispatchHint')} /></div>
        <Switch checked={value.forceDispatch} onChange={forceDispatch => edit({ forceDispatch })} label={t('chatRouterForceDispatch')} />
      </div>
      <Section title={t('chatRouterReply')} hint={t('chatRouterReplyHint')}>
        <SegmentedControl className="dt-segmented" label={t('chatRouterReply')} value={value.reply.mode}
          onChange={mode => edit({ reply: { ...value.reply, mode } })}
          options={(['brief', 'none'] as const).map(mode => ({ value: mode, label: t(`chatRouterReply.${mode}`) }))} />
      </Section>
      <Field label={t('chatRouterMaxParallel')} hint={t('chatRouterMaxParallelHint')}>
        <Input type="number" min={1} max={8} required value={String(value.worker.maxParallel ?? '')}
          onChange={event => { const parsed = Number(event.target.value); if (event.target.value !== '' && parsed >= 1) edit({ worker: { ...value.worker, maxParallel: parsed } }) }} />
      </Field>
      <Section title={t('chatRouterRoles')} count={roles.length} hint={t('chatRouterRolesHint')}>
        {roles.map((role, index) => (
          <div key={index} className="dt-field" style={{ display: 'grid', gap: 8, padding: '10px 12px',
            border: '0.5px solid var(--dsw-alias-border-l3)', borderRadius: 10 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Input aria-label={t('chatRouterRoleId')} placeholder={t('chatRouterRoleId')} value={role.id} style={{ flex: 1, minWidth: 0 }}
                onChange={event => editRole(index, { id: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })} />
              <Input aria-label={t('chatRouterRoleName')} placeholder={t('chatRouterRoleName')} value={role.name} style={{ flex: 1, minWidth: 0 }}
                onChange={event => editRole(index, { name: event.target.value })} />
              <Button size="sm" onClick={() => removeRoleAt(index)}>{t('chatRouterRoleRemove')}</Button>
            </div>
            <span className="dt-detail">{t('chatRouterRoleInstruction')}</span>
            <textarea className="dt-textarea" rows={2} aria-label={t('chatRouterRoleInstruction')}
              placeholder={t('chatRouterRoleInstructionHint')} value={role.instruction}
              onChange={event => editRole(index, { instruction: event.target.value })} />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className="dt-detail" title={t('chatRouterRoleModelHint')}>{t('chatRouterRoleModel')}</span>
              <Input aria-label={t('chatRouterRoleModelProvider')} placeholder={t('chatRouterRoleModelProvider')}
                style={{ flex: 1, minWidth: 0 }} value={textOf(index, role).provider}
                onChange={event => editModel(index, role, 'provider', event.target.value)} />
              <Input aria-label={t('chatRouterRoleModelName')} placeholder={t('chatRouterRoleModelName')}
                style={{ flex: 1, minWidth: 0 }} value={textOf(index, role).model}
                onChange={event => editModel(index, role, 'model', event.target.value)} />
            </div>
            <span className="dt-detail">{t('chatRouterRoleIdHint')}</span>
          </div>
        ))}
        {roles.length < MAX_TEAM_ROLES && <Button onClick={addRole}>{t('chatRouterRoleAdd')}</Button>}
      </Section>
      <Hint>{t('chatRouterNote')}</Hint>
    </Fields>
    <SaveBar {...draft} onDiscard={draft.discard} />
  </form>
}
