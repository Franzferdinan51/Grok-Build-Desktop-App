/**
 * preload/index.ts — Secure context bridge for renderer process
 *
 * Exposes a typed API to the SolidJS frontend via window.api.
 * All communication goes through ipcRenderer — no nodeIntegration.
 *
 * Pattern from:
 *   https://github.com/sst/opencode/blob/dev/packages/desktop/src/preload/index.ts
 */

import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron"

// ── Type definitions (mirror main/ipc.ts) ─────────────────────────────────────

export type GrokStatus =
  | { running: true; pid: number; version?: string }
  | { running: false; error?: string }

export type ElectronAPI = {
  // Grok sidecar
  grok: {
    status: () => Promise<GrokStatus>
    start: () => Promise<{ ok: boolean; error?: string }>
    stop: () => Promise<void>
    send: (method: string, params: unknown) => Promise<unknown>
    onEvent: (channel: string, handler: (data: unknown) => void) => () => void
  }
  // Persistent store
  store: {
    get: <T = unknown>(key: string) => Promise<T>
    set: <T = unknown>(key: string, value: T) => Promise<void>
    delete: (key: string) => Promise<void>
  }
  // Window controls
  window: {
    minimize: () => void
    maximize: () => void
    close: () => void
  }
  // App
  app: {
    openExternal: (url: string) => Promise<void>
    getVersion: () => Promise<string>
  }
  // Dialogs
  dialog: {
    openFile: (options?: { filters?: { name: string; extensions: string[] }[] }) => Promise<{
      canceled: boolean
      filePaths: string[]
    }>
    openDirectory: () => Promise<{ canceled: boolean; filePaths: string[] }>
  }
  // Menu event listeners
  onMenuCommand: (handler: (command: string) => void) => () => void
  onMenuSetProvider: (handler: (provider: string) => void) => () => void
}

// ── API implementation ────────────────────────────────────────────────────────

const api: ElectronAPI = {
  grok: {
    status: () => ipcRenderer.invoke("grok:status"),
    start: () => ipcRenderer.invoke("grok:start"),
    stop: () => ipcRenderer.invoke("grok:stop"),
    send: (method, params) => ipcRenderer.invoke("grok:send", method, params),
    onEvent: (channel, handler) => {
      const listener = (_event: IpcRendererEvent, data: unknown) => handler(data)
      ipcRenderer.on(`grok:event:${channel}`, listener)
      // Return unsubscribe function
      return () => ipcRenderer.removeListener(`grok:event:${channel}`, listener)
    },
  },
  store: {
    get: <T = unknown>(key: string) => ipcRenderer.invoke("store:get", key) as Promise<T>,
    set: <T = unknown>(key: string, value: T) => ipcRenderer.invoke("store:set", key, value),
    delete: (key: string) => ipcRenderer.invoke("store:delete", key),
  },
  window: {
    minimize: () => ipcRenderer.invoke("window:minimize"),
    maximize: () => ipcRenderer.invoke("window:maximize"),
    close: () => ipcRenderer.invoke("window:close"),
  },
  app: {
    openExternal: (url: string) => ipcRenderer.invoke("app:open-external", url),
    getVersion: () => ipcRenderer.invoke("app:get-version"),
  },
  dialog: {
    openFile: (opts) => ipcRenderer.invoke("dialog:open-file", opts),
    openDirectory: () => ipcRenderer.invoke("dialog:open-directory"),
  },
  onMenuCommand: (handler) => {
    const listener = (_event: IpcRendererEvent, command: string) => handler(command)
    ipcRenderer.on("menu:command", listener)
    return () => ipcRenderer.removeListener("menu:command", listener)
  },
  onMenuSetProvider: (handler) => {
    const listener = (_event: IpcRendererEvent, provider: string) => handler(provider)
    ipcRenderer.on("menu:set-provider", listener)
    return () => ipcRenderer.removeListener("menu:set-provider", listener)
  },
}

// ── Expose to renderer ────────────────────────────────────────────────────────

contextBridge.exposeInMainWorld("api", api)

// TypeScript declaration for renderer
declare global {
  interface Window {
    api: ElectronAPI
  }
}
