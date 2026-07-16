import { ipcMain, dialog, shell, app, BrowserWindow } from "electron"
import { getStore } from "./store"
import { write as writeLog } from "./logging"
import { TelegramBridge } from "./telegram"
import { LocalStudioController } from "./local-studio"
import { addProject, inspectProject, listProjects, removeProject, type ProjectRecord } from "./projects"
import type { GrokBuildBackend, RunTaskInput } from "./grok-build-backend"
import { finishGrokRun, listGrokRuns, startGrokRun } from "./grok-runs"
import { listGrokSkills } from "./grok-skills"
import { addSchedule, listSchedules, removeSchedule, toggleSchedule, type NewSchedule } from "./scheduled-tasks"
import { listProviderSecrets, removeProviderSecret, saveProviderSecret, saveProviderSettings } from "./model-secrets"

type Deps = {
  backend: () => GrokBuildBackend
  telegram: () => TelegramBridge
  localStudio: () => LocalStudioController
  getMainWindow: () => BrowserWindow | null
}

export function registerIpcHandlers(deps: Deps): void {
  ipcMain.handle("backend:status", () => deps.backend().status())
  ipcMain.handle("backend:models", () => deps.backend().models())
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
  ipcMain.handle("grok-skills:list", (_event, workspace?: string) => listGrokSkills(workspace))
  ipcMain.handle("schedules:list", () => listSchedules())
  ipcMain.handle("schedules:add", (_event, input: NewSchedule) => addSchedule(input))
  ipcMain.handle("schedules:remove", (_event, id: string) => removeSchedule(id))
  ipcMain.handle("schedules:toggle", (_event, id: string, enabled: boolean) => toggleSchedule(id, enabled))
  ipcMain.handle("provider-secrets:list", () => listProviderSecrets())
  ipcMain.handle("provider-secrets:save", (_event, id: string, value: string) => saveProviderSecret(id, value))
  ipcMain.handle("provider-secrets:save-settings", (_event, id: string, baseUrl: string, modelId: string) => saveProviderSettings(id, baseUrl, modelId))
  ipcMain.handle("provider-secrets:remove", (_event, id: string) => removeProviderSecret(id))

  ipcMain.handle("telegram:status", () => deps.telegram().status())
  ipcMain.handle("telegram:connect", async (_event, token: string) => deps.telegram().connect(token))
  ipcMain.handle("telegram:disconnect", () => deps.telegram().disconnect())
  ipcMain.handle("telegram:send", async (_event, chatId: string, text: string) => deps.telegram().send(chatId, text))
  ipcMain.handle("local-studio:status", () => deps.localStudio().snapshot())
  ipcMain.handle("local-studio:set-url", (_event, baseUrl: string) => deps.localStudio().setBaseURL(baseUrl))
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
