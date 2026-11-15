/**
 * Parameter-level command policy: argv-prefix rules with a four-state decision (`allow`, `prompt`, `forbid`).
 *
 * The policy is always evaluated; whether a decision is enforced depends on `enforce`. A record-only policy (the default)
 * writes judgments to `stateDir/command-audit.jsonl` and lets every command run; an enforcing one denies `forbid` at
 * DSH's `tools/pre-execute` waterfall and turns `prompt` into an approval recorded in `stateDir/approvals.jsonl`.
 * Worker deliveries (`gh`, `git`, `lark-cli`) are untouched in either mode unless a rule names them.
 */
import { z } from 'zod'

export const CommandDecisionSchema = z.enum(['allow', 'prompt', 'forbid'])
export type CommandDecision = z.infer<typeof CommandDecisionSchema>
/** Strictness order: the most restrictive matching rule wins a tie, as a policy engine takes the maximum decision. */
export const DECISION_RANK: Record<CommandDecision, number> = { allow: 0, prompt: 1, forbid: 2 }

export const CommandRuleSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
  /** argv prefix, program first: `['gh','pr','merge']` matches `gh pr merge …`, not a longer or unrelated command. */
  match: z.array(z.string().trim().min(1).max(200)).min(1).max(8),
  decision: CommandDecisionSchema,
  reason: z.string().trim().max(300).optional(),
}).strict()
export type CommandRule = z.infer<typeof CommandRuleSchema>

export const CommandPolicySchema = z.object({
  /** false: every decision is recorded and none is enforced. Turning this on is a separate, deliberate step. */
  enforce: z.boolean().default(false),
  /** The decision for a command no rule matches. */
  default: CommandDecisionSchema.default('allow'),
  rules: z.array(CommandRuleSchema).max(200).default([]),
  /** How long a `prompt` approval stays valid; a pending approval past it is denied by timeout. */
  approvalTtlMinutes: z.number().int().min(1).max(1440).default(10),
}).strict()
export type CommandPolicy = z.infer<typeof CommandPolicySchema>

/**
 * Rules that only name actions a worker never needs: they make the record-only phase informative without changing
 * what the product does today. A rule that could touch the delivery path (`gh`, `git`, `lark-cli` happy paths) is
 * deliberately absent until the audit shows how often it would fire.
 */
export const DEFAULT_COMMAND_POLICY: CommandPolicy = {
  enforce: false,
  default: 'allow',
  approvalTtlMinutes: 10,
  rules: [
    { id: 'force-push', match: ['git', 'push', '--force'], decision: 'forbid',
      reason: 'A force-push rewrites published history; a ticket branch must move forward.' },
    { id: 'force-push-short', match: ['git', 'push', '-f'], decision: 'forbid',
      reason: 'The short spelling of force-push.' },
    { id: 'repo-delete', match: ['gh', 'repo', 'delete'], decision: 'forbid',
      reason: 'A worker deletes a branch or a remote, never the repository.' },
  ],
}

export interface CommandRuleMatch { id: string; decision: CommandDecision; reason?: string }
export interface CommandEvaluation {
  argv: readonly string[]
  /** The decision the rules produce for this command. */
  decision: CommandDecision
  /** What an enforcing build would do; always `allow` while the policy is record-only. */
  enforced: CommandDecision
  matched?: CommandRuleMatch
}

/** Program names compare case-insensitively (Windows and shells both do); arguments compare exactly. */
const sameToken = (rule: string, actual: string, program: boolean): boolean =>
  program ? rule.toLowerCase() === actual.toLowerCase() : rule === actual

/**
 * Evaluates one command line against the policy and returns both the rule-level decision and what happens today.
 * The longest matching prefix wins; a tie goes to the stricter decision, then to the earlier rule.
 */
export function evaluateCommand(policy: CommandPolicy, argv: readonly string[]): CommandEvaluation {
  let best: { rule: CommandRule; length: number } | undefined
  for (const rule of policy.rules) {
    if (rule.match.length > argv.length) continue
    if (!rule.match.every((token, index) => sameToken(token, argv[index]!, index === 0))) continue
    const longer = !best || rule.match.length > best.length
    const stricter = !!best && rule.match.length === best.length && DECISION_RANK[rule.decision] > DECISION_RANK[best.rule.decision]
    if (longer || stricter) best = { rule, length: rule.match.length }
  }
  const decision = best?.rule.decision ?? policy.default
  const matched = best
    ? { id: best.rule.id, decision: best.rule.decision, ...best.rule.reason ? { reason: best.rule.reason } : {} }
    : undefined
  return { argv: [...argv], decision, enforced: policy.enforce ? decision : 'allow', matched }
}

/**
 * Splits a shell command line into argv for auditing, never executing anything. Quotes are honoured and a backslash
 * stays literal unless it escapes a double quote, so Windows paths and escaped quotes both survive. This is a record
 * of what ran, not a shell parser: pipelines, redirections and substitutions stay inside their token.
 */
export function splitCommandLine(line: string): string[] {
  const quotes = new Set(['"', "'"])
  const tokens: string[] = []
  let token = ''
  let quote: string | undefined
  let started = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]!
    if (quote) {
      if (char === quote) { quote = undefined; continue }
      if (char === '\\' && quote === '"' && line[index + 1] === '"') { token += '"'; index += 1; continue }
      token += char
      continue
    }
    if (quotes.has(char)) { quote = char; started = true; continue }
    if (/\s/.test(char)) {
      if (started) { tokens.push(token); token = ''; started = false }
      continue
    }
    token += char
    started = true
  }
  if (started) tokens.push(token)
  return tokens
}
