/** Settings for the chat "chief of staff": which tools a newly created main chat keeps, and whether work must be dispatched. */
import { z } from 'zod'
import type { RoleModel } from '../policy.ts'
import { MAX_TEAM_ROLES } from './tool-groups.ts'
export { CUSTOM_TOOL_GROUPS, MAX_TEAM_ROLES } from './tool-groups.ts'

/** Tools the chief of staff needs to dispatch, check and answer. These are never removed while the feature is on. */
export const CHAT_TOOLS = ['chat_dispatch', 'chat_status', 'chat_answer'] as const
/** Read-only tools kept by the `standard` preset; none of them can modify files or run commands. */
export const READ_TOOLS = ['orchestrator_read', 'read', 'read_image', 'glob', 'grep', 'skill'] as const
/** Characters of a role's instruction shown in the roster; the full text still travels with the task. */
const ROSTER_BRIEF = 120

/** A role's model route, kept structurally identical to the policy's `RoleModel` so no runtime import cycle forms. */
const TeamModelSchema: z.ZodType<RoleModel> = z.object({
  provider: z.string().trim().min(1), model: z.string().trim().min(1), reasoningEffort: z.string().trim().min(1).optional(),
}).strict()

/**
 * A named team role a chief-of-staff chat can dispatch to. The instruction travels into the worker's system prompt and
 * the model seeds the worker Session, so one deployment can convene e.g. a reviewer and a docs-writer without a second
 * plugin; an empty roster keeps the feature completely inert.
 */
export const TeamRoleSchema = z.object({
  id: z.string().trim().min(1).max(32).regex(/^[a-z][a-z0-9-]*$/, 'Use lowercase kebab-case: letters, digits and dashes'),
  name: z.string().trim().min(1).max(40),
  instruction: z.string().trim().min(1).max(2000),
  /** `null` inherits `executor.model`, the same fallback every worker had before team roles existed. */
  model: TeamModelSchema.nullable().default(null),
}).strict()
export type TeamRole = z.infer<typeof TeamRoleSchema>

const TeamRolesSchema = z.array(TeamRoleSchema).max(MAX_TEAM_ROLES).default([])
  .refine(roles => new Set(roles.map(role => role.id)).size === roles.length, 'Duplicate team role ids')
const TeamSchema = z.object({ roles: TeamRolesSchema }).strict()

export const ChatRouterSettingsSchema = z.object({
  /** Off by default: an existing deployment keeps every tool on ordinary chats until a person opts in. */
  enabled: z.boolean().default(false),
  /** Confirmed 2026-11-09: every newly created ordinary DSH conversation becomes its own chief of staff. */
  scope: z.enum(['allNewChats']).default('allNewChats'),
  tools: z.object({
    preset: z.enum(['strict', 'standard', 'custom']).default('standard'),
    /** Extra tools to keep when `preset: custom`; dispatch tools are always kept. */
    allow: z.array(z.string().trim().min(1).max(80)).max(100).default([]),
  }).default({ preset: 'standard', allow: [] }),
  /** A guard refuses any call outside the allow list with an instruction to dispatch instead. */
  forceDispatch: z.boolean().default(true),
  worker: z.object({
    preset: z.string().trim().min(1).max(80).default('standard'),
    maxParallel: z.number().int().min(1).max(8).default(3),
  }).default({ preset: 'standard', maxParallel: 3 }),
  reply: z.object({
    mode: z.enum(['brief', 'none']).default('brief'),
    onProgress: z.boolean().default(false),
  }).default({ mode: 'brief', onProgress: false }),
  /** Named roles a chief of staff may dispatch to; empty (the default) leaves dispatch exactly as it was. */
  team: TeamSchema.default({ roles: [] }),
}).strict()

export type ChatRouterSettings = z.infer<typeof ChatRouterSettingsSchema>
export type ChatToolPreset = ChatRouterSettings['tools']['preset']

export const DEFAULT_CHAT_ROUTER_SETTINGS: ChatRouterSettings = ChatRouterSettingsSchema.parse({})

/** The final allow list for a chief-of-staff session. `strict` keeps only dispatch, `standard` adds read-only tools. */
export function allowedChatTools(settings: ChatRouterSettings): string[] {
  switch (settings.tools.preset) {
    case 'strict': return [...CHAT_TOOLS]
    case 'standard': return [...CHAT_TOOLS, ...READ_TOOLS]
    case 'custom': return [...new Set([...CHAT_TOOLS, ...settings.tools.allow])]
  }
}

/** Trims a worker report to a short brief. The full transcript deliberately stays in the worker session. */
export function briefOf(text: string, max = 400): string {
  const clean = text.replace(/\r/g, '').split('\n').map(line => line.trim()).filter(Boolean).join('\n')
  if (clean.length <= max) return clean
  // Cut on whole characters: a split surrogate pair would end the brief in a lone half.
  let cut = clean.slice(0, max)
  if (/[\uD800-\uDBFF]$/.test(cut) && /^[\uDC00-\uDFFF]/.test(clean.slice(max, max + 1))) cut = cut.slice(0, -1)
  return `${cut}\n…(truncated; the full report stays in the worker session)`
}

/** The role a chief-of-staff chat may dispatch to by id, or `undefined` when the roster has no such role. */
export function teamRole(settings: ChatRouterSettings, id: string | undefined): TeamRole | undefined {
  if (id === undefined) return undefined
  return settings.team.roles.find(role => role.id === id)
}

/**
 * The team role a Trigger's `meta` names, resolved against the current roster. Roles travel on the Trigger's meta so
 * no Ticket field is added and `src/core/**` stays byte-identical to upstream; a role removed from settings simply
 * stops resolving, and the ticket keeps running under the model it was seeded with.
 */
export function roleOfMeta(settings: ChatRouterSettings, meta: Record<string, unknown> | undefined): TeamRole | undefined {
  const id = meta?.['role']
  return typeof id === 'string' ? teamRole(settings, id) : undefined
}

/**
 * The roster appended to the chief of staff's prompt: ids, names and a one-line brief. It is empty while no role is
 * configured, which is what keeps the feature inert for existing deployments.
 */
export function rosterOf(settings: ChatRouterSettings): string {
  const roles = settings.team.roles
  if (!roles.length) return ''
  const line = (role: TeamRole): string => {
    const brief = role.instruction.replace(/\s+/g, ' ').trim()
    return `- ${role.id} (${role.name}): ${brief.length > ROSTER_BRIEF ? `${brief.slice(0, ROSTER_BRIEF)}…` : brief}`
  }
  return `\n\nTeam roles you may dispatch to. Pass \`role\` with the id; the role's full instruction and model travel with the task automatically. Omit \`role\` only when no role fits.\n${roles.map(line).join('\n')}`
}
