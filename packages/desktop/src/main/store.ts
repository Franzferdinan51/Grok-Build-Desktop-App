/**
 * main/store.ts — Electron store for persistent settings
 *
 * Uses electron-store for a JSON file-based persistent store.
 * Stores: provider configs, UI state, recent sessions.
 */

import Store from "electron-store"

type ProviderConfig = {
  provider: "grok" | "lmstudio" | "openai" | "codex"
  apiKey?: string
  baseUrl?: string
  model?: string
  enabled: boolean
}

type StoreSchema = {
  providers: Record<string, ProviderConfig>
  activeProvider: string
  recentSessions: string[]
  ui: {
    sidebarPinned: boolean
    theme: "dark" | "light"
  }
  grok: {
    cliPath?: string
  }
  lmstudio: {
    baseUrl: string
  }
  telegram: {
    token?: string
  }
  projects: { id: string; name: string; path: string; addedAt: number }[]
}

let _store: Store<StoreSchema> | null = null

export function getStore(): Store<StoreSchema> {
  if (!_store) {
    _store = new Store<StoreSchema>({
      name: "grok-build-desktop",
      defaults: { activeProvider: "grok", recentSessions: [], ui: { sidebarPinned: true, theme: "dark" }, grok: {}, lmstudio: { baseUrl: "http://localhost:1234" }, telegram: {}, projects: [], providers: {} },
      clearInvalidConfig: true,
    })
  }
  return _store
}
