import { ipcMain, dialog, shell, app, BrowserWindow } from "electron"
import { getStore } from "./store"
import { write as writeLog } from "./logging"
import { TelegramBridge } from "./telegram"
import { addProject, inspectProject, listProjects, removeProject, type ProjectRecord } from "./projects"
import type { GrokBuildBackend, RunTaskInput } from "./grok-build-backend"
import { finishGrokRun, listGrokRuns, startGrokRun } from "./grok-runs"

type Deps = {
  backend: () => GrokBuildBackend
  telegram: () => TelegramBridge
  getMainWindow: () => BrowserWindow | null
}

export function registerIpcHandlers(deps: Deps): void {
  ipcMain.handle("backend:status", () => deps.backend().status())
  ipcMain.handle("backend:cancel", () => deps.backend().cancel())
  ipcMain.handle("backend:run", async (event, input: RunTaskInput) => {
    const run = startGrokRun(input)
    let grokSessionId: string | undefined
    try {
      await deps.backend().run(input, (update) => {
        if (update.type === "end" && typeof update.sessionId === "string") grokSessionId = update.sessionId
        if (!event.sender.isDestroyed()) event.sender.send("backend:event", update)
      })
      finishGrokRun(run.id, { status: "completed", grokSessionId })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      finishGrokRun(run.id, { status: "failed", grokSessionId, error: message })
      throw error
    }
    return { ok: true, runId: run.id, grokSessionId }
  })
  ipcMain.handle("grok-runs:list", () => listGrokRuns())

  ipcMain.handle("telegram:status", () => deps.telegram().status())
  ipcMain.handle("telegram:connect", async (_event, token: string) => deps.telegram().connect(token))
  ipcMain.handle("telegram:disconnect", () => deps.telegram().disconnect())
  ipcMain.handle("telegram:send", async (_event, chatId: string, text: string) => deps.telegram().send(chatId, text))
  ipcMain.handle("projects:list", async () => Promise.all(listProjects().map(inspectProject)))
  ipcMain.handle("projects:add", async (_event, path: string) => addProject(path))
  ipcMain.handle("projects:remove", (_event, id: string) => removeProject(id))

  ipcMain.handle("store:get", (_event, key: string) => getStore().get(key))
  ipcMain.handle("store:set", (_event, key: string, value: unknown) => getStore().set(key, value))
  ipcMain.handle("store:delete", (_event, key: string) => getStore().delete(key))
  ipcMain.handle("window:minimize", () => deps.getMainWindow()?.minimize())
  ipcMain.handle("window:maximize", () => {
    const win = deps.getMainWindow()
    if (win?.isMaximized()) win.unmaximize(); else win?.maximize()
  })
  ipcMain.handle("window:close", () => deps.getMainWindow()?.close())
  ipcMain.handle("app:open-external", (_event, url: string) => shell.openExternal(url))
  ipcMain.handle("app:get-version", () => app.getVersion())
  ipcMain.handle("dialog:open-file", async (_event, options?: { filters?: { name: string; extensions: string[] }[] }) =>
    dialog.showOpenDialog({ properties: ["openFile"], filters: options?.filters }))
  ipcMain.handle("dialog:open-directory", async () => dialog.showOpenDialog({ properties: ["openDirectory"] }))
  writeLog("info", "IPC handlers registered")
}
