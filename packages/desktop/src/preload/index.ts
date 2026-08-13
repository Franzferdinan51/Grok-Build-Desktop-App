import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from "electron"

export type BackendStatus = { available: boolean; command: string; version?: string; error?: string }
export type GrokBuildModelCatalog = { defaultModel?: string; models: string[] }
export type GrokBuildUpdateStatus = { currentVersion: string; latestVersion: string; updateAvailable: boolean; channel: "stable" | "alpha"; error?: string | null }
export type GrokSubcommand = { name: string; description: string }
export type OAuthProviderStatus = {
  id: "xai" | "openai" | "minimax"
  label: string
  signedIn: boolean
  helperAvailable: boolean
  helperCommand?: string
  account?: string
  expiresAt?: string
  detail: string
}
export type OAuthStatusSnapshot = { providers: OAuthProviderStatus[] }
export type BackendEvent = { type: string; data?: string; message?: string; phase?: "starting" | "advising" | "executing" | "recovering" | "completed" | "failed" | "cancelled"; sessionId?: string; usage?: unknown }
export type ActiveRunSnapshot = { runId?: string; threadId?: string; cwd: string; prompt: string; startedAt: number; sessionId?: string; phase?: BackendEvent["phase"]; events: BackendEvent[] }
export type TelegramStatus = {
  connected: boolean
  hasToken?: boolean
  polling?: boolean
  username?: string
  firstName?: string
  botId?: number
  error?: string
  lastPollAt?: number
  lastError?: string
  webhookCleared?: boolean
  commandMenuOk?: boolean
  allowedCount?: number
  pendingCount?: number
  autoApproveFirst?: boolean
  coolOffMs?: number
  requireMention?: boolean
  reactions?: boolean
  notifications?: "important" | "all"
  statusIndicator?: boolean
  homeChatId?: string
}
export type TelegramChat = {
  id: string
  label: string
  type?: string
  title?: string
  username?: string
  firstName?: string
  lastName?: string
  lastSeenAt?: number
  lastPreview?: string
}
export type ProjectSnapshot = { id: string; name: string; path: string; addedAt: number; isGit: boolean; branch?: string; changedFiles: number; diffStat?: string }
export type GrokRunRecord = { id: string; threadId?: string; cwd: string; prompt: string; model?: string; startedAt: number; finishedAt?: number; status: "running" | "completed" | "failed" | "cancelled" | "interrupted"; grokSessionId?: string; error?: string; latencyMs?: number; tokensIn?: number; tokensOut?: number; costUsd?: number; advisorCount?: number; advisorFailures?: number; errorClass?: string; eventTail?: { type: string; data?: string; message?: string; phase?: string; sessionId?: string }[] }
export type LocalStudioSnapshot = { configured: boolean; reachable: boolean; baseUrl: string; health?: unknown; status?: unknown; gpus?: unknown; error?: string }
export type HostControlResult = { ok: boolean; backend: string; action: string; observed?: unknown; error?: string | null; permission_required?: boolean; missing_permissions?: unknown[] }
export type GrokSkill = { name: string; description: string; path: string; scope: "project" | "user" | "compatible" }
export type GrokWorkflow = { name: string; description: string; path: string; scope: "project" | "user" }
export type SessionPlan = { sessionId: string; cwd: string; path: string; markdown: string; todos?: unknown; updatedAt: number }
export type GitWorktree = { path: string; branch?: string; head?: string; detached: boolean; isMain: boolean }
export type ScheduledGrokTask = { id: string; name: string; prompt: string; cwd: string; model?: string; runAt: number; repeatMinutes?: number; enabled: boolean; running?: boolean; lastError?: string; lastRunAt?: number; nextRunAt: number; lastStatus?: "completed" | "failed"; lastRunId?: string; lastThreadId?: string }
export type ScheduledTaskEvent = { taskId: string; name: string; status: "running" | "completed" | "failed"; detail?: string; at: number; runId?: string; threadId?: string }
export type ProviderSecret = { id: string; label: string; envKey: string; baseUrl: string; modelId: string; configured: boolean }
export type WorkspaceFile = { path: string; size: number }
export type StoredChatThread = { id: string; workspace: string; title: string; createdAt: number; updatedAt: number; messages: { id: string; role: "user" | "assistant"; logs: { kind: "text" | "thought" | "error"; content: string }[]; createdAt: number }[]; sessionId: string; model?: string; summary?: string; pinned?: boolean; archived?: boolean; sessionStatus?: "new" | "resumable" | "recovered" | "broken" }
export type StoredChatSummary = Omit<StoredChatThread, "messages"> & { messageCount: number }
export type DuckbotMemoryStatus = { enabled: boolean; available: boolean; repository?: string; soulDirectory: string; embeddingProvider: string; embeddingModel?: string; error?: string }
export type DuckbotMemoryHealth = DuckbotMemoryStatus & { checkedAt: number; stats?: { vector_chunks?: number; vector_by_tier?: Record<string, number>; graph_entities?: number; graph_relationships?: number; blocks?: number; quarantine_pending?: number; generated_at?: number } }
export type BrowserAgentStatus = { running: boolean; url?: string; title?: string }
export type BrowserAgentSnapshot = { url: string; title: string; text: string; html: string; viewport: { width: number; height: number }; links: { text: string; href: string }[]; controls: { index: number; tag: string; type: string | null; label: string; disabled: boolean }[]; screenshotPath: string }

export type ElectronAPI = {
  backend: {
    status: () => Promise<BackendStatus>
    models: () => Promise<GrokBuildModelCatalog>
    run: (input: { prompt: string; cwd: string; threadId?: string; model?: string; thinking?: boolean; autoApprove?: boolean; continueSession?: boolean; resume?: string; resumeFallbackPrompt?: string; bestOfN?: number; selfVerify?: boolean; maxTurns?: number; disableWebSearch?: boolean; subagents?: boolean; agent?: string; agents?: string; permissionMode?: "default" | "acceptEdits" | "auto" | "dontAsk" | "bypassPermissions" | "plan"; allow?: string[]; deny?: string[]; tools?: string; disallowedTools?: string; memory?: "default" | "experimental" | "disabled"; sandbox?: string; rules?: string; systemPrompt?: string; verbatim?: boolean; forkSession?: boolean; restoreCode?: boolean; worktree?: boolean; worktreeName?: string; worktreeRef?: string; jsonSchema?: string; promptFile?: string; promptJson?: string; sessionId?: string; fallbackModel?: string; noPlan?: boolean; longTermMemory?: boolean; hostControls?: boolean; transport?: "headless" | "acp"; moa?: { referenceModels: string[]; aggregatorModel?: string; referenceReasoningEffort?: "low" | "medium" | "high"; aggregatorReasoningEffort?: "low" | "medium" | "high"; referenceTokenBudget?: number; context?: string } }) => Promise<{ ok: boolean; runId?: string; grokSessionId?: string }>
    activeRun: () => Promise<ActiveRunSnapshot | null>
    autoLearn: (input: { prompt: string; cwd: string; model?: string }) => Promise<{ ok: boolean }>
    cancel: () => Promise<void>
    setPath: (path: string) => Promise<BackendStatus>
    oauthLogin: (provider: "xai" | "openai" | "minimax") => Promise<{ ok: boolean; message: string }>
    oauthStatus: () => Promise<OAuthStatusSnapshot>
    checkUpdate: () => Promise<GrokBuildUpdateStatus>
    installUpdate: (channel: "stable" | "alpha") => Promise<GrokBuildUpdateStatus>
    tool: (command: string, cwd?: string) => Promise<{ stdout: string; stderr: string }>
    commands: () => Promise<GrokSubcommand[]>
    workflows: (workspace?: string) => Promise<GrokWorkflow[]>
    sessionPlan: (cwd: string, sessionId?: string) => Promise<SessionPlan | null>
    onEvent: (handler: (event: BackendEvent) => void) => () => void
  }
  telegram: {
    status: (probe?: boolean) => Promise<TelegramStatus>
    connect: (token: string) => Promise<TelegramStatus>
    reconnect: () => Promise<TelegramStatus>
    disconnect: () => Promise<void>
    forgetToken: () => Promise<{ ok: boolean }>
    send: (chatId: string, text: string) => Promise<{ ok: boolean; error?: string }>
    allowedChats: () => Promise<string[]>
    pendingChats: () => Promise<string[]>
    chats: () => Promise<{ allowed: TelegramChat[]; pending: TelegramChat[] }>
    setAllowedChats: (chatIds: string[]) => Promise<string[]>
    approveChat: (chatId: string) => Promise<string[]>
    denyChat: (chatId: string) => Promise<string[]>
    revokeChat: (chatId: string) => Promise<string[]>
    setAutoApproveFirst: (enabled: boolean) => Promise<boolean>
    setAgentOptions: (patch: { requireMention?: boolean; reactions?: boolean; notifications?: "important" | "all"; statusIndicator?: boolean }) => Promise<{ requireMention: boolean; reactions: boolean; notifications: "important" | "all"; statusIndicator: boolean; homeChatId?: string }>
    onChange: (handler: () => void) => () => void
  }
  memory: { status: () => Promise<DuckbotMemoryStatus>; health: () => Promise<DuckbotMemoryHealth>; wakeUp: (query?: string) => Promise<string>; recall: (query: string) => Promise<string> }
  projects: { list: () => Promise<ProjectSnapshot[]>; add: (path: string) => Promise<ProjectSnapshot>; scratch: () => Promise<ProjectSnapshot>; remove: (id: string) => Promise<void> }
  grokRuns: { list: () => Promise<GrokRunRecord[]> }
  conversations: { list: (workspace?: string) => Promise<StoredChatThread[]>; summaries: (workspace?: string) => Promise<StoredChatSummary[]>; get: (id: string) => Promise<StoredChatThread | undefined>; save: (thread: StoredChatThread) => Promise<StoredChatThread>; search: (query: string, workspace?: string) => Promise<StoredChatThread[]>; export: (id: string) => Promise<{ saved: boolean; path?: string }> }
  skills: { list: (workspace?: string) => Promise<GrokSkill[]> }
  schedules: { list: () => Promise<ScheduledGrokTask[]>; add: (input: { name: string; prompt: string; cwd: string; model?: string; runAt: number; repeatMinutes?: number }) => Promise<ScheduledGrokTask>; remove: (id: string) => Promise<void>; toggle: (id: string, enabled: boolean) => Promise<void>; runNow: (id: string) => Promise<void>; onEvent: (handler: (event: ScheduledTaskEvent) => void) => () => void }
  providerSecrets: { list: () => Promise<ProviderSecret[]>; save: (id: string, value: string) => Promise<void>; saveSettings: (id: string, baseUrl: string, modelId: string) => Promise<void>; remove: (id: string) => Promise<void>; test: (id: string) => Promise<{ ok: boolean; models?: number; message: string }> }
  providers: { add: (label: string, baseUrl: string, modelId: string) => Promise<void>; remove: (id: string) => Promise<void> }
  workspace: { files: (root: string) => Promise<WorkspaceFile[]>; read: (root: string, path: string) => Promise<string>; write: (root: string, path: string, content: string) => Promise<void>; command: (root: string, command: string) => Promise<{ stdout: string; stderr: string; code: number }>; gitChanges: (root: string) => Promise<{ status: string; path: string; staged?: boolean }[]>; gitDiff: (root: string, path: string) => Promise<string>; gitAction: (root: string, path: string, action: "stage" | "unstage" | "discard") => Promise<void>; gitWorktrees: (root: string) => Promise<GitWorktree[]>; pathForFile: (file: { path?: string }) => string }
  preview: { start: (root: string) => Promise<{ url: string }>; stop: () => Promise<void>; inspect: () => Promise<{ url: string; title: string; text: string; html: string; viewport: { width: number; height: number }; links: { text: string; href: string }[]; controls: { tag: string; type: string | null; label: string; disabled: boolean }[]; screenshotPath: string }> }
  localStudio: { status: () => Promise<LocalStudioSnapshot>; setURL: (baseUrl: string) => Promise<string> }
  hostControls: { browserStatus: () => Promise<HostControlResult>; browserOpen: (url: string) => Promise<HostControlResult>; desktopStatus: () => Promise<HostControlResult> }
  browserAgent: { status: () => Promise<BrowserAgentStatus>; nav: (url: string) => Promise<{ ok: boolean; url: string; title: string }>; snapshot: () => Promise<BrowserAgentSnapshot>; click: (selector: string) => Promise<{ ok: boolean; error?: string }>; type: (selector: string, text: string) => Promise<{ ok: boolean; error?: string }>; screenshot: () => Promise<{ ok: boolean; path: string; error?: string }>; saveScreenshot: (dataUrl: string) => Promise<string>; stop: () => Promise<void> }
  store: { get: <T = unknown>(key: string) => Promise<T>; set: <T = unknown>(key: string, value: T) => Promise<void>; delete: (key: string) => Promise<void> }
  window: { minimize: () => void; maximize: () => void; close: () => void }
  app: { openExternal: (url: string) => Promise<void>; getVersion: () => Promise<string>; backendRepository: () => Promise<string>; restart: () => Promise<{ ok: boolean }>; notify: (input: { kind: "success" | "error"; title: string; body: string }) => Promise<{ shown: boolean }> }
  quickEntry: { submit: (text: string, target: "current" | "new") => Promise<{ ok: boolean }>; close: () => Promise<void> }
  dialog: { openFile: (options?: { filters?: { name: string; extensions: string[] }[] }) => Promise<{ canceled: boolean; filePaths: string[] }>; openDirectory: () => Promise<{ canceled: boolean; filePaths: string[] }> }
  onMenuCommand: (handler: (command: string) => void) => () => void
  onMenuSetProvider: (handler: (provider: string) => void) => () => void
  onQuickEntrySubmit: (handler: (payload: { text: string; target: "current" | "new" }) => void) => () => void
}

const api: ElectronAPI = {
  backend: {
    status: () => ipcRenderer.invoke("backend:status"),
    models: () => ipcRenderer.invoke("backend:models"),
    run: (input) => ipcRenderer.invoke("backend:run", input),
    activeRun: () => ipcRenderer.invoke("backend:active-run"),
    autoLearn: (input) => ipcRenderer.invoke("backend:auto-learn", input),
    cancel: () => ipcRenderer.invoke("backend:cancel"),
    setPath: (path) => ipcRenderer.invoke("backend:set-path", path),
    oauthLogin: (provider) => ipcRenderer.invoke("backend:oauth-login", provider),
    oauthStatus: () => ipcRenderer.invoke("backend:oauth-status"),
    checkUpdate: () => ipcRenderer.invoke("backend:update-check"), installUpdate: (channel) => ipcRenderer.invoke("backend:update-install", channel), tool: (command, cwd) => ipcRenderer.invoke("backend:tool", command, cwd), commands: () => ipcRenderer.invoke("backend:commands"),
    workflows: (workspace) => ipcRenderer.invoke("backend:workflows", workspace),
    sessionPlan: (cwd, sessionId) => ipcRenderer.invoke("backend:session-plan", cwd, sessionId),
    onEvent: (handler) => {
      const listener = (_event: IpcRendererEvent, update: BackendEvent) => handler(update)
      ipcRenderer.on("backend:event", listener)
      return () => ipcRenderer.removeListener("backend:event", listener)
    },
  },
  telegram: {
    status: (probe) => ipcRenderer.invoke("telegram:status", probe),
    connect: (token) => ipcRenderer.invoke("telegram:connect", token),
    reconnect: () => ipcRenderer.invoke("telegram:reconnect"),
    disconnect: () => ipcRenderer.invoke("telegram:disconnect"),
    forgetToken: () => ipcRenderer.invoke("telegram:forget-token"),
    send: (chatId, text) => ipcRenderer.invoke("telegram:send", chatId, text),
    allowedChats: () => ipcRenderer.invoke("telegram:allowed-chats"),
    pendingChats: () => ipcRenderer.invoke("telegram:pending-chats"),
    chats: () => ipcRenderer.invoke("telegram:chats"),
    setAllowedChats: (chatIds) => ipcRenderer.invoke("telegram:set-allowed-chats", chatIds),
    approveChat: (chatId) => ipcRenderer.invoke("telegram:approve-chat", chatId),
    denyChat: (chatId) => ipcRenderer.invoke("telegram:deny-chat", chatId),
    revokeChat: (chatId) => ipcRenderer.invoke("telegram:revoke-chat", chatId),
    setAutoApproveFirst: (enabled) => ipcRenderer.invoke("telegram:set-auto-approve-first", enabled),
    setAgentOptions: (patch) => ipcRenderer.invoke("telegram:set-agent-options", patch),
    onChange: (handler) => {
      const listener = () => handler()
      ipcRenderer.on("telegram:changed", listener)
      return () => ipcRenderer.removeListener("telegram:changed", listener)
    },
  },
  memory: { status: () => ipcRenderer.invoke("memory:status"), health: () => ipcRenderer.invoke("memory:health"), wakeUp: (query) => ipcRenderer.invoke("memory:wake-up", query), recall: (query) => ipcRenderer.invoke("memory:recall", query) },
  projects: { list: () => ipcRenderer.invoke("projects:list"), add: (path) => ipcRenderer.invoke("projects:add", path), scratch: () => ipcRenderer.invoke("projects:scratch"), remove: (id) => ipcRenderer.invoke("projects:remove", id) },
  grokRuns: { list: () => ipcRenderer.invoke("grok-runs:list") },
  conversations: { list: (workspace) => ipcRenderer.invoke("conversations:list", workspace), summaries: (workspace) => ipcRenderer.invoke("conversations:summaries", workspace), get: (id) => ipcRenderer.invoke("conversations:get", id), save: (thread) => ipcRenderer.invoke("conversations:save", thread), search: (query, workspace) => ipcRenderer.invoke("conversations:search", query, workspace), export: (id) => ipcRenderer.invoke("conversations:export", id) },
  skills: { list: (workspace) => ipcRenderer.invoke("grok-skills:list", workspace) },
  schedules: { list: () => ipcRenderer.invoke("schedules:list"), add: (input) => ipcRenderer.invoke("schedules:add", input), remove: (id) => ipcRenderer.invoke("schedules:remove", id), toggle: (id, enabled) => ipcRenderer.invoke("schedules:toggle", id, enabled), runNow: (id) => ipcRenderer.invoke("schedules:run-now", id), onEvent: (handler) => { const listener = (_event: IpcRendererEvent, update: ScheduledTaskEvent) => handler(update); ipcRenderer.on("schedules:event", listener); return () => ipcRenderer.removeListener("schedules:event", listener) } },
  providerSecrets: { list: () => ipcRenderer.invoke("provider-secrets:list"), save: (id, value) => ipcRenderer.invoke("provider-secrets:save", id, value), saveSettings: (id, baseUrl, modelId) => ipcRenderer.invoke("provider-secrets:save-settings", id, baseUrl, modelId), remove: (id) => ipcRenderer.invoke("provider-secrets:remove", id), test: (id) => ipcRenderer.invoke("provider-secrets:test", id) },
  providers: { add: (label, baseUrl, modelId) => ipcRenderer.invoke("providers:add", label, baseUrl, modelId), remove: (id) => ipcRenderer.invoke("providers:remove", id) },
  workspace: { files: (root) => ipcRenderer.invoke("workspace:files", root), read: (root, path) => ipcRenderer.invoke("workspace:read", root, path), write: (root, path, content) => ipcRenderer.invoke("workspace:write", root, path, content), command: (root, command) => ipcRenderer.invoke("workspace:command", root, command), gitChanges: (root) => ipcRenderer.invoke("workspace:git-changes", root), gitDiff: (root, path) => ipcRenderer.invoke("workspace:git-diff", root, path), gitAction: (root, path, action) => ipcRenderer.invoke("workspace:git-action", root, path, action), gitWorktrees: (root) => ipcRenderer.invoke("workspace:git-worktrees", root), pathForFile: (file) => {
      try { return webUtils.getPathForFile(file as Parameters<typeof webUtils.getPathForFile>[0]) }
      catch { return typeof file.path === "string" ? file.path : "" }
    } },
  preview: { start: (root) => ipcRenderer.invoke("preview:start", root), stop: () => ipcRenderer.invoke("preview:stop"), inspect: () => ipcRenderer.invoke("preview:inspect") },
  localStudio: { status: () => ipcRenderer.invoke("local-studio:status"), setURL: (baseUrl) => ipcRenderer.invoke("local-studio:set-url", baseUrl) },
  hostControls: { browserStatus: () => ipcRenderer.invoke("host-controls:browser-status"), browserOpen: (url) => ipcRenderer.invoke("host-controls:browser-open", url), desktopStatus: () => ipcRenderer.invoke("host-controls:desktop-status") },
  browserAgent: { status: () => ipcRenderer.invoke("browser:status"), nav: (url) => ipcRenderer.invoke("browser:nav", url), snapshot: () => ipcRenderer.invoke("browser:snapshot"), click: (selector) => ipcRenderer.invoke("browser:click", selector), type: (selector, text) => ipcRenderer.invoke("browser:type", selector, text), screenshot: () => ipcRenderer.invoke("browser:screenshot"), saveScreenshot: (dataUrl) => ipcRenderer.invoke("browser:save-screenshot", dataUrl), stop: () => ipcRenderer.invoke("browser:stop") },
  store: { get: <T = unknown>(key: string) => ipcRenderer.invoke("store:get", key) as Promise<T>, set: <T = unknown>(key: string, value: T) => ipcRenderer.invoke("store:set", key, value), delete: (key) => ipcRenderer.invoke("store:delete", key) },
  window: { minimize: () => ipcRenderer.invoke("window:minimize"), maximize: () => ipcRenderer.invoke("window:maximize"), close: () => ipcRenderer.invoke("window:close") },
  app: { openExternal: (url) => ipcRenderer.invoke("app:open-external", url), getVersion: () => ipcRenderer.invoke("app:get-version"), backendRepository: () => ipcRenderer.invoke("app:backend-repository"), restart: () => ipcRenderer.invoke("app:restart"), notify: (input) => ipcRenderer.invoke("app:notify", input) },
  quickEntry: { submit: (text, target) => ipcRenderer.invoke("quick-entry:submit", text, target), close: () => ipcRenderer.invoke("quick-entry:close") },
  dialog: { openFile: (options) => ipcRenderer.invoke("dialog:open-file", options), openDirectory: () => ipcRenderer.invoke("dialog:open-directory") },
  onMenuCommand: (handler) => { const listener = (_event: IpcRendererEvent, command: string) => handler(command); ipcRenderer.on("menu:command", listener); return () => ipcRenderer.removeListener("menu:command", listener) },
  onMenuSetProvider: (handler) => { const listener = (_event: IpcRendererEvent, provider: string) => handler(provider); ipcRenderer.on("menu:set-provider", listener); return () => ipcRenderer.removeListener("menu:set-provider", listener) },
  onQuickEntrySubmit: (handler: (payload: { text: string; target: "current" | "new" }) => void) => { const listener = (_event: IpcRendererEvent, payload: { text: string; target: "current" | "new" }) => handler(payload); ipcRenderer.on("quick-entry:submit", listener); return () => ipcRenderer.removeListener("quick-entry:submit", listener) },
}

contextBridge.exposeInMainWorld("api", api)
declare global { interface Window { api: ElectronAPI } }
