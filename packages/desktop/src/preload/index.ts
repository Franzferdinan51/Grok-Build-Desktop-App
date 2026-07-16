import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron"

export type BackendStatus = { available: boolean; command: string; version?: string; error?: string }
export type GrokBuildModelCatalog = { defaultModel?: string; models: string[] }
export type BackendEvent = { type: string; data?: string; message?: string; sessionId?: string; usage?: unknown }
export type TelegramStatus = { connected: boolean; username?: string; botId?: number; error?: string }
export type ProjectSnapshot = { id: string; name: string; path: string; addedAt: number; isGit: boolean; branch?: string; changedFiles: number; diffStat?: string }
export type GrokRunRecord = { id: string; cwd: string; prompt: string; model?: string; startedAt: number; finishedAt?: number; status: "running" | "completed" | "failed" | "cancelled"; grokSessionId?: string; error?: string }
export type LocalStudioSnapshot = { configured: boolean; reachable: boolean; baseUrl: string; health?: unknown; status?: unknown; gpus?: unknown; error?: string }
export type GrokSkill = { name: string; description: string; path: string; scope: "project" | "user" | "compatible" }
export type ScheduledGrokTask = { id: string; name: string; prompt: string; cwd: string; model?: string; runAt: number; repeatMinutes?: number; enabled: boolean; lastRunAt?: number; nextRunAt: number; lastStatus?: "completed" | "failed" }
export type ProviderSecret = { id: string; label: string; envKey: string; baseUrl: string; modelId: string; configured: boolean }
export type WorkspaceFile = { path: string; size: number }

export type ElectronAPI = {
  backend: {
    status: () => Promise<BackendStatus>
    models: () => Promise<GrokBuildModelCatalog>
    run: (input: { prompt: string; cwd: string; model?: string; thinking?: boolean; autoApprove?: boolean; resume?: string; bestOfN?: number; selfVerify?: boolean; maxTurns?: number; disableWebSearch?: boolean; moa?: { referenceModels: string[]; aggregatorModel?: string } }) => Promise<{ ok: boolean; runId?: string; grokSessionId?: string }>
    autoLearn: (input: { prompt: string; cwd: string; model?: string }) => Promise<{ ok: boolean }>
    cancel: () => Promise<void>
    setPath: (path: string) => Promise<BackendStatus>
    onEvent: (handler: (event: BackendEvent) => void) => () => void
  }
  telegram: {
    status: () => Promise<TelegramStatus>
    connect: (token: string) => Promise<TelegramStatus>
    disconnect: () => Promise<void>
    send: (chatId: string, text: string) => Promise<{ ok: boolean; error?: string }>
  }
  projects: { list: () => Promise<ProjectSnapshot[]>; add: (path: string) => Promise<ProjectSnapshot>; scratch: () => Promise<ProjectSnapshot>; remove: (id: string) => Promise<void> }
  grokRuns: { list: () => Promise<GrokRunRecord[]> }
  skills: { list: (workspace?: string) => Promise<GrokSkill[]> }
  schedules: { list: () => Promise<ScheduledGrokTask[]>; add: (input: { name: string; prompt: string; cwd: string; model?: string; runAt: number; repeatMinutes?: number }) => Promise<ScheduledGrokTask>; remove: (id: string) => Promise<void>; toggle: (id: string, enabled: boolean) => Promise<void>; runNow: (id: string) => Promise<void> }
  providerSecrets: { list: () => Promise<ProviderSecret[]>; save: (id: string, value: string) => Promise<void>; saveSettings: (id: string, baseUrl: string, modelId: string) => Promise<void>; remove: (id: string) => Promise<void>; test: (id: string) => Promise<{ ok: boolean; models?: number; message: string }> }
  providers: { add: (label: string, baseUrl: string, modelId: string) => Promise<void>; remove: (id: string) => Promise<void> }
  workspace: { files: (root: string) => Promise<WorkspaceFile[]>; read: (root: string, path: string) => Promise<string>; write: (root: string, path: string, content: string) => Promise<void>; command: (root: string, command: string) => Promise<{ stdout: string; stderr: string; code: number }>; gitChanges: (root: string) => Promise<{ status: string; path: string }[]>; gitDiff: (root: string, path: string) => Promise<string> }
  preview: { start: (root: string) => Promise<{ url: string }>; stop: () => Promise<void>; inspect: () => Promise<{ url: string; title: string; text: string; html: string; viewport: { width: number; height: number }; links: { text: string; href: string }[]; controls: { tag: string; type: string | null; label: string; disabled: boolean }[]; screenshotPath: string }> }
  localStudio: { status: () => Promise<LocalStudioSnapshot>; setURL: (baseUrl: string) => Promise<string> }
  store: { get: <T = unknown>(key: string) => Promise<T>; set: <T = unknown>(key: string, value: T) => Promise<void>; delete: (key: string) => Promise<void> }
  window: { minimize: () => void; maximize: () => void; close: () => void }
  app: { openExternal: (url: string) => Promise<void>; getVersion: () => Promise<string>; backendRepository: () => Promise<string> }
  dialog: { openFile: (options?: { filters?: { name: string; extensions: string[] }[] }) => Promise<{ canceled: boolean; filePaths: string[] }>; openDirectory: () => Promise<{ canceled: boolean; filePaths: string[] }> }
  onMenuCommand: (handler: (command: string) => void) => () => void
  onMenuSetProvider: (handler: (provider: string) => void) => () => void
}

const api: ElectronAPI = {
  backend: {
    status: () => ipcRenderer.invoke("backend:status"),
    models: () => ipcRenderer.invoke("backend:models"),
    run: (input) => ipcRenderer.invoke("backend:run", input),
    autoLearn: (input) => ipcRenderer.invoke("backend:auto-learn", input),
    cancel: () => ipcRenderer.invoke("backend:cancel"),
    setPath: (path) => ipcRenderer.invoke("backend:set-path", path),
    onEvent: (handler) => {
      const listener = (_event: IpcRendererEvent, update: BackendEvent) => handler(update)
      ipcRenderer.on("backend:event", listener)
      return () => ipcRenderer.removeListener("backend:event", listener)
    },
  },
  telegram: {
    status: () => ipcRenderer.invoke("telegram:status"), connect: (token) => ipcRenderer.invoke("telegram:connect", token),
    disconnect: () => ipcRenderer.invoke("telegram:disconnect"), send: (chatId, text) => ipcRenderer.invoke("telegram:send", chatId, text),
  },
  projects: { list: () => ipcRenderer.invoke("projects:list"), add: (path) => ipcRenderer.invoke("projects:add", path), scratch: () => ipcRenderer.invoke("projects:scratch"), remove: (id) => ipcRenderer.invoke("projects:remove", id) },
  grokRuns: { list: () => ipcRenderer.invoke("grok-runs:list") },
  skills: { list: (workspace) => ipcRenderer.invoke("grok-skills:list", workspace) },
  schedules: { list: () => ipcRenderer.invoke("schedules:list"), add: (input) => ipcRenderer.invoke("schedules:add", input), remove: (id) => ipcRenderer.invoke("schedules:remove", id), toggle: (id, enabled) => ipcRenderer.invoke("schedules:toggle", id, enabled), runNow: (id) => ipcRenderer.invoke("schedules:run-now", id) },
  providerSecrets: { list: () => ipcRenderer.invoke("provider-secrets:list"), save: (id, value) => ipcRenderer.invoke("provider-secrets:save", id, value), saveSettings: (id, baseUrl, modelId) => ipcRenderer.invoke("provider-secrets:save-settings", id, baseUrl, modelId), remove: (id) => ipcRenderer.invoke("provider-secrets:remove", id), test: (id) => ipcRenderer.invoke("provider-secrets:test", id) },
  providers: { add: (label, baseUrl, modelId) => ipcRenderer.invoke("providers:add", label, baseUrl, modelId), remove: (id) => ipcRenderer.invoke("providers:remove", id) },
  workspace: { files: (root) => ipcRenderer.invoke("workspace:files", root), read: (root, path) => ipcRenderer.invoke("workspace:read", root, path), write: (root, path, content) => ipcRenderer.invoke("workspace:write", root, path, content), command: (root, command) => ipcRenderer.invoke("workspace:command", root, command), gitChanges: (root) => ipcRenderer.invoke("workspace:git-changes", root), gitDiff: (root, path) => ipcRenderer.invoke("workspace:git-diff", root, path) },
  preview: { start: (root) => ipcRenderer.invoke("preview:start", root), stop: () => ipcRenderer.invoke("preview:stop"), inspect: () => ipcRenderer.invoke("preview:inspect") },
  localStudio: { status: () => ipcRenderer.invoke("local-studio:status"), setURL: (baseUrl) => ipcRenderer.invoke("local-studio:set-url", baseUrl) },
  store: { get: <T = unknown>(key: string) => ipcRenderer.invoke("store:get", key) as Promise<T>, set: <T = unknown>(key: string, value: T) => ipcRenderer.invoke("store:set", key, value), delete: (key) => ipcRenderer.invoke("store:delete", key) },
  window: { minimize: () => ipcRenderer.invoke("window:minimize"), maximize: () => ipcRenderer.invoke("window:maximize"), close: () => ipcRenderer.invoke("window:close") },
  app: { openExternal: (url) => ipcRenderer.invoke("app:open-external", url), getVersion: () => ipcRenderer.invoke("app:get-version"), backendRepository: () => ipcRenderer.invoke("app:backend-repository") },
  dialog: { openFile: (options) => ipcRenderer.invoke("dialog:open-file", options), openDirectory: () => ipcRenderer.invoke("dialog:open-directory") },
  onMenuCommand: (handler) => { const listener = (_event: IpcRendererEvent, command: string) => handler(command); ipcRenderer.on("menu:command", listener); return () => ipcRenderer.removeListener("menu:command", listener) },
  onMenuSetProvider: (handler) => { const listener = (_event: IpcRendererEvent, provider: string) => handler(provider); ipcRenderer.on("menu:set-provider", listener); return () => ipcRenderer.removeListener("menu:set-provider", listener) },
}

contextBridge.exposeInMainWorld("api", api)
declare global { interface Window { api: ElectronAPI } }
