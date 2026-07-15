import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron"

export type BackendStatus = { available: boolean; command: string; version?: string; error?: string }
export type BackendEvent = { type: string; data?: string; message?: string; sessionId?: string; usage?: unknown }
export type TelegramStatus = { connected: boolean; username?: string; botId?: number; error?: string }

export type ElectronAPI = {
  backend: {
    status: () => Promise<BackendStatus>
    run: (input: { prompt: string; cwd: string; model?: string; thinking?: boolean; autoApprove?: boolean; resume?: string }) => Promise<{ ok: boolean }>
    cancel: () => Promise<void>
    onEvent: (handler: (event: BackendEvent) => void) => () => void
  }
  telegram: {
    status: () => Promise<TelegramStatus>
    connect: (token: string) => Promise<TelegramStatus>
    disconnect: () => Promise<void>
    send: (chatId: string, text: string) => Promise<{ ok: boolean; error?: string }>
  }
  store: { get: <T = unknown>(key: string) => Promise<T>; set: <T = unknown>(key: string, value: T) => Promise<void>; delete: (key: string) => Promise<void> }
  window: { minimize: () => void; maximize: () => void; close: () => void }
  app: { openExternal: (url: string) => Promise<void>; getVersion: () => Promise<string> }
  dialog: { openFile: (options?: { filters?: { name: string; extensions: string[] }[] }) => Promise<{ canceled: boolean; filePaths: string[] }>; openDirectory: () => Promise<{ canceled: boolean; filePaths: string[] }> }
  onMenuCommand: (handler: (command: string) => void) => () => void
  onMenuSetProvider: (handler: (provider: string) => void) => () => void
}

const api: ElectronAPI = {
  backend: {
    status: () => ipcRenderer.invoke("backend:status"),
    run: (input) => ipcRenderer.invoke("backend:run", input),
    cancel: () => ipcRenderer.invoke("backend:cancel"),
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
  store: { get: <T = unknown>(key: string) => ipcRenderer.invoke("store:get", key) as Promise<T>, set: <T = unknown>(key: string, value: T) => ipcRenderer.invoke("store:set", key, value), delete: (key) => ipcRenderer.invoke("store:delete", key) },
  window: { minimize: () => ipcRenderer.invoke("window:minimize"), maximize: () => ipcRenderer.invoke("window:maximize"), close: () => ipcRenderer.invoke("window:close") },
  app: { openExternal: (url) => ipcRenderer.invoke("app:open-external", url), getVersion: () => ipcRenderer.invoke("app:get-version") },
  dialog: { openFile: (options) => ipcRenderer.invoke("dialog:open-file", options), openDirectory: () => ipcRenderer.invoke("dialog:open-directory") },
  onMenuCommand: (handler) => { const listener = (_event: IpcRendererEvent, command: string) => handler(command); ipcRenderer.on("menu:command", listener); return () => ipcRenderer.removeListener("menu:command", listener) },
  onMenuSetProvider: (handler) => { const listener = (_event: IpcRendererEvent, provider: string) => handler(provider); ipcRenderer.on("menu:set-provider", listener); return () => ipcRenderer.removeListener("menu:set-provider", listener) },
}

contextBridge.exposeInMainWorld("api", api)
declare global { interface Window { api: ElectronAPI } }
