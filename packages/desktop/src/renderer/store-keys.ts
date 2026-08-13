/**
 * store-keys.ts — Centralized store key catalogue + typing.
 *
 * Every key the renderer reads/writes via `window.api.store.get|set|delete`
 * is enumerated here so a typo at one call site becomes a TypeScript
 * error instead of an undefined silently returned. The shape table lets
 * `storeGet` / `storeSet` know the exact value type for the well-known
 * keys. Foreign keys still work via the untyped fallthrough.
 */

export const STORE_KEYS = {
  workspaceLast: "workspace.last",
  cliPath: "grok.cliPath",
  autoUpdate: "grok.autoUpdate",
  updateChannel: "grok.updateChannel",
  lastAutoUpdateTarget: "grok.lastAutoUpdateTarget",
  lastAutoUpdateAttempt: "grok.lastAutoUpdateAttempt",
  defaultsModel: "defaults.model",
  defaultsThinking: "defaults.thinking",
  defaultsAutoApprove: "defaults.autoApprove",
  defaultsPlanMode: "defaults.planMode",
  defaultsSelfVerify: "defaults.selfVerify",
  defaultsMaxTurns: "defaults.maxTurns",
  defaultsWebSearch: "defaults.webSearch",
  defaultsAdvanced: "defaults.advanced",
  defaultsCliSpeedMigrated: "defaults.cliSpeedMigrated",
  defaultsExecutionV2: "defaults.executionV2",
  agentSubagents: "agent.subagents",
  agentDelegationMode: "agent.delegationMode",
  agentAppControls: "agent.appControls",
  agentSessionIdleHours: "agent.sessionIdleHours",
  moaEnabled: "moa.enabled",
  moaCandidates: "moa.candidates",
  moaReferenceModels: "moa.referenceModels",
  moaAggregatorModel: "moa.aggregatorModel",
  moaReferenceEffort: "moa.referenceEffort",
  moaAggregatorEffort: "moa.aggregatorEffort",
  moaReferenceTokenBudget: "moa.referenceTokenBudget",
  memoryEnabled: "memory.enabled",
  memoryTelegramEnabled: "memory.telegramEnabled",
  autoLearnEnabled: "autoLearn.enabled",
  autoLearnInterval: "autoLearn.interval",
  autoLearnModel: "autoLearn.model",
  autoLearnLastStatus: "autoLearn.lastStatus",
  previewEnabled: "preview.enabled",
  previewUrl: "preview.url",
  layoutSidebarCollapsed: "layout.sidebarCollapsed",
  layoutSessionSidebarOpen: "layout.sessionSidebarOpen",
  layoutPreviewCollapsed: "layout.previewCollapsed",
  hostBrowserScript: "host.browserScript",
  hostDesktopScript: "host.desktopScript",
  hostDisabled: "host.disabled",
} as const

export const queueStoreKey = (threadId: string) => `chat.queue.${threadId}`
export const draftStoreKey = (threadId: string) => `chat.draft.${threadId}`
export const artifactContextKey = (workspace: string, threadId: string) => `artifact.context.${encodeURIComponent(workspace)}.${threadId}`

export type StoreKey = (typeof STORE_KEYS)[keyof typeof STORE_KEYS]

// Value-type map for the well-known top-level keys. Custom per-workspace
// keys (`chat.*`, `goal.*`, `chat.session.*`, `chat.active.*`,
// `chat.threads.*`, `chat.draft.*`, `autoLearn.turns.*`) are foreign-string addresses
// produced by local helpers and don't need static checking.
export interface StoreShape {
  [STORE_KEYS.workspaceLast]: string
  [STORE_KEYS.cliPath]: string | undefined
  [STORE_KEYS.autoUpdate]: boolean
  [STORE_KEYS.updateChannel]: "stable" | "alpha"
  [STORE_KEYS.lastAutoUpdateTarget]: string | undefined
  [STORE_KEYS.lastAutoUpdateAttempt]: number | undefined
  [STORE_KEYS.defaultsModel]: string
  [STORE_KEYS.defaultsThinking]: boolean
  [STORE_KEYS.defaultsAutoApprove]: boolean
  [STORE_KEYS.defaultsPlanMode]: boolean
  [STORE_KEYS.defaultsSelfVerify]: boolean
  [STORE_KEYS.defaultsMaxTurns]: number
  [STORE_KEYS.defaultsWebSearch]: boolean
  [STORE_KEYS.defaultsAdvanced]: unknown
  [STORE_KEYS.defaultsCliSpeedMigrated]: boolean
  [STORE_KEYS.defaultsExecutionV2]: boolean
  [STORE_KEYS.agentSubagents]: boolean
  [STORE_KEYS.agentDelegationMode]: "balanced" | "aggressive"
  [STORE_KEYS.agentAppControls]: boolean
  [STORE_KEYS.agentSessionIdleHours]: number
  [STORE_KEYS.moaEnabled]: boolean
  [STORE_KEYS.moaCandidates]: number
  [STORE_KEYS.moaReferenceModels]: string[]
  [STORE_KEYS.moaAggregatorModel]: string
  [STORE_KEYS.moaReferenceEffort]: "low" | "medium" | "high"
  [STORE_KEYS.moaAggregatorEffort]: "low" | "medium" | "high"
  [STORE_KEYS.moaReferenceTokenBudget]: number
  [STORE_KEYS.memoryEnabled]: boolean
  [STORE_KEYS.memoryTelegramEnabled]: boolean
  [STORE_KEYS.autoLearnEnabled]: boolean
  [STORE_KEYS.autoLearnInterval]: number
  [STORE_KEYS.autoLearnModel]: string
  [STORE_KEYS.autoLearnLastStatus]: string
  [STORE_KEYS.previewEnabled]: boolean
  [STORE_KEYS.previewUrl]: string
  [STORE_KEYS.layoutSidebarCollapsed]: boolean
  [STORE_KEYS.layoutSessionSidebarOpen]: boolean
  [STORE_KEYS.layoutPreviewCollapsed]: boolean
  [STORE_KEYS.hostBrowserScript]: string | undefined
  [STORE_KEYS.hostDesktopScript]: string | undefined
  [STORE_KEYS.hostDisabled]: boolean
}
