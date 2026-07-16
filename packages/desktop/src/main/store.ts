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
}

type StoreSchema = {
  runs: GrokRunRecord[]
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
      defaults: { runs: [], ui: { sidebarPinned: true, theme: "dark" }, grok: {}, lmstudio: { baseUrl: "http://localhost:1234" }, telegram: {}, projects: [] },
      clearInvalidConfig: true,
    })
  }
  return _store
}
