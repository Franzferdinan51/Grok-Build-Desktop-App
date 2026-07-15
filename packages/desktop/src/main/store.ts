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
    authToken?: string
  }
  lmstudio: {
    baseUrl: string
  }
}

const schema: Store.Schema<StoreSchema> = {
  providers: { type: "object", default: {} },
  activeProvider: { type: "string", default: "grok" },
  recentSessions: { type: "array", default: [] },
  ui: {
    type: "object",
    default: { sidebarPinned: true, theme: "dark" },
  },
  grok: {
    type: "object",
    default: { baseUrl: "https://api.x.ai" },
  },
  lmstudio: {
    type: "object",
    default: { baseUrl: "http://100.116.54.125:1234" },
  },
}

let _store: Store<StoreSchema> | null = null

export function getStore(): Store<StoreSchema> {
  if (!_store) {
    _store = new Store<StoreSchema>({
      name: "grok-build-desktop",
      schema,
      clearInvalidConfig: true,
    })
  }
  return _store
}
