/**
 * main/ipc.ts — Electron IPC handler registration
 *
 * Mirrors the opencode IPC pattern:
 *   https://github.com/sst/opencode/blob/dev/packages/desktop/src/main/ipc.ts
 *
 * All IPC handlers are registered here. The preload script exposes a typed
 * API to the renderer via contextBridge.
 */

import { ipcMain, dialog, shell, app, BrowserWindow } from "electron"
import type { IpcMainInvokeEvent } from "electron"
import { getStore } from "./store"
import { write as writeLog } from "./logging"

type Deps = {
  sidecar: () => import("./sidecar").GrokSidecarManager | null
  getMainWindow: () => BrowserWindow | null
}

export function registerIpcHandlers(deps: Deps): void {
  // ── Grok Sidecar ────────────────────────────────────────────────────────

  ipcMain.handle("grok:status", () => {
    const sc = deps.sidecar()
    return sc?.status ?? { running: false, error: "not started" }
  })

  ipcMain.handle("grok:start", async () => {
    const sc = deps.sidecar()
    if (!sc) return { ok: false, error: "no sidecar instance" }
    try {
      await sc.start()
      return { ok: true }
    } catch (err: unknown) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle("grok:stop", async () => {
    const sc = deps.sidecar()
    if (!sc) return
    await sc.stop()
  })

  ipcMain.handle("grok:send", async (_event: IpcMainInvokeEvent, method: string, params: unknown) => {
    const sc = deps.sidecar()
    if (!sc) throw new Error("sidecar not running")
    return sc.send(method, params)
  })

  ipcMain.handle("grok:on-event", (event, channel: string) => {
    const sc = deps.sidecar()
    if (!sc) return
    sc.onEvent(channel, (data: unknown) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send(`grok:event:${channel}`, data)
      }
    })
  })

  // ── Provider Config ───────────────────────────────────────────────────────

  ipcMain.handle("store:get", (_event: IpcMainInvokeEvent, key: string) => {
    return getStore().get(key)
  })

  ipcMain.handle("store:set", (_event: IpcMainInvokeEvent, key: string, value: unknown) => {
    getStore().set(key, value)
  })

  ipcMain.handle("store:delete", (_event: IpcMainInvokeEvent, key: string) => {
    getStore().delete(key)
  })

  // ── App / Window ──────────────────────────────────────────────────────────

  ipcMain.handle("window:minimize", () => {
    deps.getMainWindow()?.minimize()
  })

  ipcMain.handle("window:maximize", () => {
    const win = deps.getMainWindow()
    if (win?.isMaximized()) {
      win.unmaximize()
    } else {
      win?.maximize()
    }
  })

  ipcMain.handle("window:close", () => {
    deps.getMainWindow()?.close()
  })

  ipcMain.handle("app:open-external", (_event: IpcMainInvokeEvent, url: string) => {
    return shell.openExternal(url)
  })

  ipcMain.handle("app:get-version", () => {
    return app.getVersion()
  })

  // ── File pickers ──────────────────────────────────────────────────────────

  ipcMain.handle("dialog:open-file", async (_event, options?: { filters?: { name: string; extensions: string[] }[] }) => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: options?.filters,
    })
    return result
  })

  ipcMain.handle("dialog:open-directory", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory"],
    })
    return result
  })

  writeLog("info", "IPC handlers registered")
}
