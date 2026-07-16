import { ipcMain, dialog, shell, app, BrowserWindow } from "electron"
import { mkdirSync } from "fs"
import { writeFile } from "fs/promises"
import { join } from "path"
import { getStore } from "./store"
import { write as writeLog } from "./logging"
import { TelegramBridge } from "./telegram"
import { LocalStudioController } from "./local-studio"
import { addProject, inspectProject, listProjects, removeProject, type ProjectRecord } from "./projects"
import { GrokBuildBackend, type GrokBuildEvent, type RunTaskInput } from "./grok-build-backend"
import { finishGrokRun, listGrokRuns, startGrokRun } from "./grok-runs"
import { listGrokSkills } from "./grok-skills"
import { addSchedule, listSchedules, removeSchedule, runScheduleNow, toggleSchedule, type NewSchedule } from "./scheduled-tasks"
import { addCustomProvider, listProviderSecrets, removeCustomProvider, removeProviderSecret, saveProviderSecret, saveProviderSettings, testProvider } from "./model-secrets"
import { gitChangedFiles, gitFileDiff, listWorkspaceFiles, readWorkspaceFile, runWorkspaceCommand, writeWorkspaceFile } from "./workspace-tools"
import { PreviewServer } from "./preview-server"

type Deps = {
  backend: () => GrokBuildBackend
  telegram: () => TelegramBridge
  localStudio: () => LocalStudioController
  getMainWindow: () => BrowserWindow | null
  preview: () => PreviewServer
}

export function registerIpcHandlers(deps: Deps): void {
  ipcMain.handle("backend:status", () => deps.backend().status())
  ipcMain.handle("backend:models", () => deps.backend().models())
  ipcMain.handle("backend:cancel", () => deps.backend().cancel())
  ipcMain.handle("backend:set-path", (_event, path: string) => { getStore().set("grok.cliPath", path.trim() || undefined); return deps.backend().status() })
  ipcMain.handle("backend:oauth-login", (_event, provider: "xai") => deps.backend().startOAuth(provider))
  ipcMain.handle("backend:run", async (event, input: RunTaskInput) => {
    const run = startGrokRun(input)
    let grokSessionId: string | undefined
    let eventTimer: ReturnType<typeof setTimeout> | undefined
    let pendingEvents: GrokBuildEvent[] = []
    const flushEvents = () => {
      if (eventTimer) clearTimeout(eventTimer)
      eventTimer = undefined
      const updates = pendingEvents
      pendingEvents = []
      if (event.sender.isDestroyed()) return
      for (const update of updates) event.sender.send("backend:event", update)
    }
    const queueEvent = (update: GrokBuildEvent) => {
      const previous = pendingEvents[pendingEvents.length - 1]
      if ((update.type === "text" || update.type === "thought") && previous?.type === update.type && typeof previous.data === "string" && typeof update.data === "string") {
        previous.data += update.data
      } else {
        pendingEvents.push(update)
      }
      if (update.type === "end" || update.type === "error") flushEvents()
      else if (!eventTimer) eventTimer = setTimeout(flushEvents, 16)
    }
    try {
      await deps.backend().run(input, (update) => {
        if (update.type === "end" && typeof update.sessionId === "string") grokSessionId = update.sessionId
        queueEvent(update)
      })
      flushEvents()
      finishGrokRun(run.id, { status: "completed", grokSessionId })
    } catch (error) {
      flushEvents()
      const message = error instanceof Error ? error.message : String(error)
      finishGrokRun(run.id, { status: "failed", grokSessionId, error: message })
      throw error
    }
    return { ok: true, runId: run.id, grokSessionId }
  })
  ipcMain.handle("backend:auto-learn", async (_event, input: Pick<RunTaskInput, "prompt" | "cwd" | "model">) => {
    // A separate quiet Grok process keeps the foreground chat transcript clean.
    // This endpoint is only called after a completed turn and only when the
    // user has explicitly enabled auto-learn in Settings.
    const reviewer = new GrokBuildBackend()
    await reviewer.run({ ...input, thinking: true, autoApprove: true, maxTurns: 24 }, () => undefined)
    return { ok: true }
  })
  ipcMain.handle("grok-runs:list", () => listGrokRuns())
  ipcMain.handle("grok-skills:list", (_event, workspace?: string) => listGrokSkills(workspace))
  ipcMain.handle("schedules:list", () => listSchedules())
  ipcMain.handle("schedules:add", (_event, input: NewSchedule) => addSchedule(input))
  ipcMain.handle("schedules:remove", (_event, id: string) => removeSchedule(id))
  ipcMain.handle("schedules:toggle", (_event, id: string, enabled: boolean) => toggleSchedule(id, enabled))
  ipcMain.handle("schedules:run-now", (_event, id: string) => runScheduleNow(id))
  ipcMain.handle("provider-secrets:list", () => listProviderSecrets())
  ipcMain.handle("provider-secrets:save", (_event, id: string, value: string) => saveProviderSecret(id, value))
  ipcMain.handle("provider-secrets:save-settings", (_event, id: string, baseUrl: string, modelId: string) => saveProviderSettings(id, baseUrl, modelId))
  ipcMain.handle("provider-secrets:remove", (_event, id: string) => removeProviderSecret(id))
  ipcMain.handle("provider-secrets:test", (_event, id: string) => testProvider(id))
  ipcMain.handle("providers:add", (_event, label: string, baseUrl: string, modelId: string) => addCustomProvider(label, baseUrl, modelId))
  ipcMain.handle("providers:remove", (_event, id: string) => removeCustomProvider(id))

  ipcMain.handle("telegram:status", () => deps.telegram().status())
  ipcMain.handle("telegram:connect", async (_event, token: string) => deps.telegram().connect(token))
  ipcMain.handle("telegram:disconnect", () => deps.telegram().disconnect())
  ipcMain.handle("telegram:send", async (_event, chatId: string, text: string) => deps.telegram().send(chatId, text))
  ipcMain.handle("telegram:allowed-chats", () => deps.telegram().allowedChats())
  ipcMain.handle("telegram:set-allowed-chats", (_event, chatIds: string[]) => deps.telegram().setAllowedChats(chatIds))
  ipcMain.handle("local-studio:status", () => deps.localStudio().snapshot())
  ipcMain.handle("local-studio:set-url", (_event, baseUrl: string) => deps.localStudio().setBaseURL(baseUrl))
  ipcMain.handle("projects:list", async () => Promise.all(listProjects().map(inspectProject)))
  ipcMain.handle("projects:add", async (_event, path: string) => addProject(path))
  ipcMain.handle("projects:remove", (_event, id: string) => removeProject(id))
  ipcMain.handle("projects:scratch", async () => {
    const path = join(app.getPath("userData"), "Scratch")
    mkdirSync(path, { recursive: true })
    return addProject(path)
  })
  ipcMain.handle("workspace:files", (_event, root: string) => listWorkspaceFiles(root))
  ipcMain.handle("workspace:read", (_event, root: string, path: string) => readWorkspaceFile(root, path))
  ipcMain.handle("workspace:write", (_event, root: string, path: string, content: string) => writeWorkspaceFile(root, path, content))
  ipcMain.handle("workspace:command", (_event, root: string, command: string) => runWorkspaceCommand(root, command))
  ipcMain.handle("workspace:git-changes", (_event, root: string) => gitChangedFiles(root))
  ipcMain.handle("workspace:git-diff", (_event, root: string, path: string) => gitFileDiff(root, path))
  ipcMain.handle("preview:start", (_event, root: string) => deps.preview().start(root))
  ipcMain.handle("preview:stop", () => deps.preview().stop())
  ipcMain.handle("preview:inspect", async () => {
    const win = deps.getMainWindow()
    if (!win) throw new Error("Preview window is unavailable")
    const frame = win.webContents.mainFrame.frames.find((candidate) => /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\//.test(candidate.url))
    if (!frame) throw new Error("Open the preview before asking the agent to inspect it")
    const page = await frame.executeJavaScript(`(() => ({
      url: location.href,
      title: document.title,
      text: (document.body?.innerText || '').slice(0, 30000),
      html: (document.documentElement?.outerHTML || '').slice(0, 60000),
      viewport: { width: innerWidth, height: innerHeight },
      links: Array.from(document.querySelectorAll('a')).slice(0, 100).map(a => ({ text: (a.textContent || '').trim(), href: a.href })),
      controls: Array.from(document.querySelectorAll('button,input,select,textarea')).slice(0, 100).map((el) => ({ tag: el.tagName.toLowerCase(), type: el.getAttribute('type'), label: (el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.textContent || '').trim(), disabled: Boolean(el.disabled) }))
    }))()`) as Record<string, unknown>
    const screenshotPath = join(app.getPath("temp"), `grok-build-preview-${Date.now()}.png`)
    const screenshot = await win.webContents.capturePage()
    await writeFile(screenshotPath, screenshot.toPNG())
    return { ...page, screenshotPath }
  })

  ipcMain.handle("store:get", (_event, key: string) => getStore().get(key))
  ipcMain.handle("store:set", (_event, key: string, value: unknown) => getStore().set(key, value))
  ipcMain.handle("store:delete", (_event, key: string) => getStore().delete(key))
  ipcMain.handle("window:minimize", () => deps.getMainWindow()?.minimize())
  ipcMain.handle("window:maximize", () => {
    const win = deps.getMainWindow()
    if (win?.isMaximized()) win.unmaximize(); else win?.maximize()
  })
  ipcMain.handle("window:close", () => deps.getMainWindow()?.close())
  ipcMain.handle("app:open-external", (_event, url: string) => {
    const target = new URL(url)
    if (target.protocol !== "http:" && target.protocol !== "https:") throw new Error("Only HTTP(S) links can be opened")
    return shell.openExternal(target.toString())
  })
  ipcMain.handle("app:get-version", () => app.getVersion())
  ipcMain.handle("app:backend-repository", () => "https://github.com/Franzferdinan51/grok-build")
  ipcMain.handle("dialog:open-file", async (_event, options?: { filters?: { name: string; extensions: string[] }[] }) =>
    dialog.showOpenDialog({ properties: ["openFile"], filters: options?.filters }))
  ipcMain.handle("dialog:open-directory", async () => dialog.showOpenDialog({ properties: ["openDirectory"] }))
  writeLog("info", "IPC handlers registered")
}
