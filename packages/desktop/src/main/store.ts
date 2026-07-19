/**
 * main/store.ts — Electron store for persistent settings
 *
 * Uses electron-store for a JSON file-based persistent store.
 * Stores: provider configs, UI state, recent sessions.
 */

import Store from "electron-store"

export type GrokRunRecord = {
  id: string
  cwd: string
  prompt: string
  model?: string
  startedAt: number
  finishedAt?: number
  status: "running" | "completed" | "failed" | "cancelled"
  grokSessionId?: string
  error?: string
  /** Structured local observability. Cost stays absent unless the CLI reports it. */
  latencyMs?: number
  tokensIn?: number
  tokensOut?: number
  costUsd?: number
  advisorCount?: number
  advisorFailures?: number
  errorClass?: string
}

export type ScheduledGrokTask = {
  id: string; name: string; prompt: string; cwd: string; model?: string
  runAt: number; repeatMinutes?: number; enabled: boolean
  lastRunAt?: number; nextRunAt: number; lastStatus?: "completed" | "failed"
}

type StoreSchema = {
  runs: GrokRunRecord[]
  ui: {
    sidebarPinned: boolean
    theme: "dark" | "light"
  }
  grok: {
    cliPath?: string
    providerSecrets?: Record<string, { label: string; envKey: string; encrypted: string }>
    providerSettings?: Record<string, { baseUrl: string; modelId: string }>
    customProviders?: { id: string; label: string; envKey: string; baseUrl: string }[]
    lastModelCatalog?: { defaultModel?: string; models: string[] }
  }
  lmstudio: {
    baseUrl: string
  }
  localStudio: {
    baseUrl: string
  }
  telegram: {
    token?: string
    updateOffset?: number
    allowedChatIds?: string[]
    pendingChatIds?: string[]
    sessions?: Record<string, {
      sessionId?: string; model?: string; workspace?: string; updatedAt: number
      transcript?: { role: "user" | "assistant"; text: string }[]
      lastTask?: string; compressedSummary?: string; thinking?: boolean; mode?: "fast" | "balanced" | "deep"
    }>
  }
  projects: { id: string; name: string; path: string; addedAt: number }[]
  schedules: ScheduledGrokTask[]
  memory?: { enabled?: boolean; telegramEnabled?: boolean; duckbotPath?: string; soulPath?: string }
  host?: { browserScript?: string; desktopScript?: string; disabled?: boolean }
}

let _store: Store<StoreSchema> | null = null

export function getStore(): Store<StoreSchema> {
  if (!_store) {
    _store = new Store<StoreSchema>({
      name: "grok-build-desktop",
      defaults: { runs: [], ui: { sidebarPinned: true, theme: "dark" }, grok: {}, lmstudio: { baseUrl: "http://localhost:1234" }, localStudio: { baseUrl: "" }, telegram: { allowedChatIds: [], pendingChatIds: [] }, projects: [], schedules: [] },
      clearInvalidConfig: true,
    })
  }
  return _store
}
