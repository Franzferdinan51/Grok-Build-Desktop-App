/**
 * First-run defaults that match a fast Grok Build CLI session.
 * Stored user choices always win; these only fill missing keys.
 */
export type PermissionMode = "default" | "acceptEdits" | "auto" | "dontAsk" | "bypassPermissions" | "plan"

export type AdvancedSettings = {
  agent: string
  agents: string
  permissionMode: PermissionMode
  allow: string
  deny: string
  tools: string
  disallowedTools: string
  memory: "default" | "experimental" | "disabled"
  sandbox: string
  rules: string
  systemPrompt: string
  verbatim: boolean
  forkSession: boolean
  restoreCode: boolean
  worktree: boolean
  worktreeName: string
  worktreeRef: string
  jsonSchema: string
  promptFile: string
  promptJson: string
  sessionId: string
  noPlan: boolean
}

export const ADVANCED_DEFAULTS: AdvancedSettings = {
  agent: "",
  agents: "",
  permissionMode: "auto",
  allow: "",
  deny: "",
  tools: "",
  disallowedTools: "",
  memory: "default",
  sandbox: "",
  rules: "",
  systemPrompt: "",
  verbatim: false,
  forkSession: false,
  restoreCode: false,
  worktree: false,
  worktreeName: "",
  worktreeRef: "",
  jsonSchema: "",
  promptFile: "",
  promptJson: "",
  sessionId: "",
  noPlan: true,
}

export type FriendlyDefaults = {
  thinking: boolean
  autoApprove: boolean
  selfVerify: boolean
  webSearch: boolean
  subagents: boolean
  autoUpdate: boolean
  updateChannel: "stable" | "alpha"
  maxTurns: number
  autoLearn: boolean
  delegationMode: "balanced" | "aggressive"
}

export const FRIENDLY_DEFAULTS: FriendlyDefaults = {
  thinking: false,
  autoApprove: false,
  selfVerify: false,
  webSearch: true,
  subagents: false,
  autoUpdate: true,
  updateChannel: "stable",
  maxTurns: 0,
  autoLearn: false,
  delegationMode: "balanced",
}

export type StoredFriendlySettings = {
  thinking?: boolean
  autoApprove?: boolean
  selfVerify?: boolean
  webSearch?: boolean
  subagents?: boolean
  autoUpdate?: boolean
  updateChannel?: "stable" | "alpha"
  maxTurns?: number
  autoLearn?: boolean
  delegationMode?: "balanced" | "aggressive"
}

export function resolveFriendlyDefaults(stored: StoredFriendlySettings): {
  values: FriendlyDefaults
  persist: StoredFriendlySettings
} {
  const persist: StoredFriendlySettings = {}
  const pick = <K extends keyof typeof FRIENDLY_DEFAULTS>(key: K, storedValue: (typeof FRIENDLY_DEFAULTS)[K] | undefined) => {
    if (storedValue === undefined) {
      persist[key] = FRIENDLY_DEFAULTS[key] as never
      return FRIENDLY_DEFAULTS[key]
    }
    return storedValue
  }
  const values = {
    thinking: pick("thinking", stored.thinking),
    autoApprove: pick("autoApprove", stored.autoApprove),
    selfVerify: pick("selfVerify", stored.selfVerify),
    webSearch: pick("webSearch", stored.webSearch),
    subagents: pick("subagents", stored.subagents),
    autoUpdate: pick("autoUpdate", stored.autoUpdate),
    updateChannel: (stored.updateChannel ?? FRIENDLY_DEFAULTS.updateChannel),
    maxTurns: stored.maxTurns === undefined ? FRIENDLY_DEFAULTS.maxTurns : stored.maxTurns,
    autoLearn: pick("autoLearn", stored.autoLearn),
    delegationMode: stored.delegationMode ?? FRIENDLY_DEFAULTS.delegationMode,
  }
  if (stored.updateChannel === undefined) persist.updateChannel = FRIENDLY_DEFAULTS.updateChannel
  if (stored.maxTurns === undefined) persist.maxTurns = FRIENDLY_DEFAULTS.maxTurns
  if (stored.delegationMode === undefined) persist.delegationMode = FRIENDLY_DEFAULTS.delegationMode
  return { values, persist }
}

export type SettingsTab = "essentials" | "accounts" | "advanced"

export const SETTINGS_TABS: { id: SettingsTab; label: string }[] = [
  { id: "essentials", label: "Essentials" },
  { id: "accounts", label: "Accounts" },
  { id: "advanced", label: "Advanced" },
]
