import { ipcMain, dialog, app, BrowserWindow, Notification } from "electron"
import { existsSync, mkdirSync } from "fs"
import { unlink, writeFile } from "fs/promises"
import { join } from "path"
import { getStore } from "./store"
import { write as writeLog } from "./logging"
import { TelegramBridge } from "./telegram"
import { LocalStudioController } from "./local-studio"
import { safeOpenExternal, UnsafeExternalUrlError } from "./security"
import { addProject, inspectProject, listProjects, removeProject } from "./projects"
import { GrokBuildBackend, type GrokBuildEvent, type RunTaskInput } from "./grok-build-backend"
import { classifyRunError, finishGrokRun, listGrokRuns, startGrokRun, usageMetrics } from "./grok-runs"
import { listGrokSkills } from "./grok-skills"
import { listGrokWorkflows } from "./grok-workflows"
import { readSessionPlan } from "./grok-session-files"
import { BrowserManager } from "./browser-manager"
import { addSchedule, listSchedules, onScheduleEvent, removeSchedule, runScheduleNow, toggleSchedule, type NewSchedule } from "./scheduled-tasks"
import { addCustomProvider, listProviderSecrets, removeCustomProvider, removeProviderSecret, saveProviderSecret, saveProviderSettings, testProvider } from "./model-secrets"
import { applyGitFileAction, gitChangedFiles, gitFileDiff, gitWorktrees, listWorkspaceFiles, readWorkspaceFile, runWorkspaceCommand, writeWorkspaceFile } from "./workspace-tools"
import { PreviewServer } from "./preview-server"
import { exportConversation, getConversation, listConversationSummaries, listConversations, saveConversation, searchConversations, type StoredChatThread } from "./conversation-store"
import { DuckbotMemory } from "./duckbot-memory"
import { hostBrowserOpen, hostBrowserStatus, hostDesktopStatus } from "./host-controls"
import { isRendererForbiddenStoreKey } from "./store-guard"
import { normalizeDesktopNotification } from "./desktop-notifications"

type Deps = {
  backend: () => GrokBuildBackend
  telegram: () => TelegramBridge
  localStudio: () => LocalStudioController
  getMainWindow: () => BrowserWindow | null
  preview: () => PreviewServer
  getQuickEntryWindow?: () => BrowserWindow | null
  onBackendIdle?: () => void
}

const browserManager = new BrowserManager()

let previousPreviewScreenshot: string | undefined
let previousBrowserAgentScreenshot: string | undefined

export function registerIpcHandlers(deps: Deps): void {
  const memory = new DuckbotMemory()
  onScheduleEvent((event) => deps.getMainWindow()?.webContents.send("schedules:event", event))
  ipcMain.handle("quick-entry:submit", (_event, text: string, target: "current" | "new") => {
    const trimmed = typeof text === "string" ? text.trim() : ""
    if (!trimmed || trimmed.length > 20_000 || !["current", "new"].includes(target)) throw new Error("Invalid Quick Entry submission")
    deps.getMainWindow()?.webContents.send("quick-entry:submit", { text: trimmed, target })
    deps.getQuickEntryWindow?.()?.hide()
    return { ok: true }
  })
  ipcMain.handle("quick-entry:close", (event) => BrowserWindow.fromWebContents(event.sender)?.hide())
  ipcMain.handle("backend:status", () => deps.backend().status())
  ipcMain.handle("backend:models", () => deps.backend().models())
  ipcMain.handle("backend:cancel", () => deps.backend().cancel())
  ipcMain.handle("backend:set-path", (_event, path: string) => {
    // Reject obviously dangerous payloads before persisting: empty strings
    // are allowed (clears the override), but everything else must look
    // like a path. Renderer paste attacks have shipped shell metacharacters
    // through this handler in the past; sanitising here keeps the stored
    // `grok.cliPath` and the derived `GROK_BUILD_PATH` environment safe.
    const trimmed = typeof path === "string" ? path.trim() : ""
    if (!trimmed) {
      getStore().set("grok.cliPath", undefined)
      deps.backend().invalidateModelsCache()
      deps.backend().invalidateCliFlagsCache()
      return deps.backend().status()
    }
    if (/[;&|<>`$()\\\n\r]/.test(trimmed)) throw new Error("Grok Build path contains shell metacharacters")
    if (trimmed.includes("/") || trimmed.includes("\\") || /^[A-Za-z]:[\\/]/.test(trimmed)) {
      if (!existsSync(trimmed)) throw new Error(`Grok Build binary not found at ${trimmed}`)
    }
    getStore().set("grok.cliPath", trimmed)
    deps.backend().invalidateModelsCache()
    deps.backend().invalidateCliFlagsCache()
    return deps.backend().status()
  })
  ipcMain.handle("backend:oauth-login", (_event, provider: "xai" | "openai" | "minimax") => deps.backend().startOAuth(provider))
  ipcMain.handle("backend:oauth-status", () => deps.backend().oauthStatus())
  ipcMain.handle("backend:update-check", () => deps.backend().checkUpdate())
  ipcMain.handle("backend:update-install", async (_event, channel: "stable" | "alpha") => {
    const result = await deps.backend().installUpdate(channel)
    // Same rationale as auto-update: the on-disk binary just changed, so the
    // cached flag discovery and model catalog must not survive it.
    deps.backend().invalidateModelsCache()
    deps.backend().invalidateCliFlagsCache()
    return result
  })
  ipcMain.handle("backend:tool", (_event, command: string, cwd?: string) => deps.backend().runTool(command, cwd))
  ipcMain.handle("app:restart", () => {
    // Stop the entire Grok child process group before relaunching so Restart
    // cannot leave MCP/tool children behind consuming CPU or memory.
    deps.backend().cancel()
    setTimeout(() => {
      // Preserve the packaged executable and renderer arguments. Calling
      // relaunch() with Electron's implicit defaults can relaunch the helper
      // process (or no app at all) in packaged builds.
      app.relaunch({ execPath: process.execPath, args: process.argv.slice(1) })
      app.exit(0)
    }, 1_000).unref()
    return { ok: true }
  })
  ipcMain.handle("memory:status", () => memory.status())
  ipcMain.handle("memory:recall", (_event, query: string) => memory.context(query))
  ipcMain.handle("backend:run", async (event, input: RunTaskInput) => {
    const run = startGrokRun({ ...input, advisorCount: input.moa?.referenceModels.filter(Boolean).slice(0, 8).length })
    deps.backend().setActiveRunId(run.id)
    let grokSessionId: string | undefined
    let cancelled = false
    let usage: unknown
    let advisorFailures = 0
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
      if (update.type === "cancelled") cancelled = true
      if (update.type === "end") usage = update.usage
      if (update.type === "thought" && typeof update.data === "string" && /Reference \d+ failed and was skipped\./.test(update.data)) advisorFailures += 1
      const previous = pendingEvents[pendingEvents.length - 1]
      if ((update.type === "text" || update.type === "thought") && previous?.type === update.type && typeof previous.data === "string" && typeof update.data === "string") {
        previous.data += update.data
      } else {
        pendingEvents.push(update)
      }
      if (update.type === "end" || update.type === "error" || update.type === "cancelled") flushEvents()
      else if (!eventTimer) eventTimer = setTimeout(flushEvents, 16)
    }
    try {
      await deps.backend().run(input, (update) => {
        if ("sessionId" in update && typeof update.sessionId === "string") grokSessionId = update.sessionId
        queueEvent(update)
      })
      flushEvents()
      finishGrokRun(run.id, { status: cancelled ? "cancelled" : "completed", grokSessionId, latencyMs: Date.now() - run.startedAt, advisorFailures, ...usageMetrics(usage) })
    } catch (error) {
      flushEvents()
      const message = error instanceof Error ? error.message : String(error)
      finishGrokRun(run.id, { status: "failed", grokSessionId, error: message, latencyMs: Date.now() - run.startedAt, advisorFailures, ...usageMetrics(usage), errorClass: classifyRunError(message) })
      throw error
    } finally {
      deps.backend().clearActiveRun(run.id)
      deps.onBackendIdle?.()
    }
    return { ok: true, runId: run.id, grokSessionId }
  })
  ipcMain.handle("backend:active-run", () => deps.backend().activeRunSnapshot())
  ipcMain.handle("backend:auto-learn", async (_event, input: Pick<RunTaskInput, "prompt" | "cwd" | "model">) => {
    // A separate quiet Grok process keeps the foreground chat transcript clean.
    // This endpoint is only called after a completed turn and only when the
    // user has explicitly enabled auto-learn in Settings.
    const reviewer = new GrokBuildBackend()
    await reviewer.run({ ...input, thinking: true, autoApprove: true, maxTurns: 24 }, () => undefined)
    return { ok: true }
  })
  ipcMain.handle("grok-runs:list", () => listGrokRuns())
  ipcMain.handle("conversations:list", (_event, workspace?: string) => listConversations(workspace))
  ipcMain.handle("conversations:summaries", (_event, workspace?: string) => listConversationSummaries(workspace))
  ipcMain.handle("conversations:get", (_event, id: string) => getConversation(id))
  ipcMain.handle("conversations:save", (_event, thread: StoredChatThread) => saveConversation(thread))
  ipcMain.handle("conversations:search", (_event, query: string, workspace?: string) => searchConversations(query, workspace))
  ipcMain.handle("conversations:export", async (_event, id: string) => {
    const markdown = await exportConversation(id)
    const result = await dialog.showSaveDialog({ defaultPath: "conversation.md", filters: [{ name: "Markdown", extensions: ["md"] }] })
    if (result.canceled || !result.filePath) return { saved: false }
    await writeFile(result.filePath, markdown)
    return { saved: true, path: result.filePath }
  })
  ipcMain.handle("grok-skills:list", (_event, workspace?: string) => listGrokSkills(workspace))
  ipcMain.handle("backend:workflows", (_event, workspace?: string) => listGrokWorkflows(workspace))
  ipcMain.handle("backend:session-plan", (_event, cwd: string, sessionId?: string) => readSessionPlan(cwd, sessionId))
  ipcMain.handle("schedules:list", () => listSchedules())
  ipcMain.handle("schedules:add", (_event, input: NewSchedule) => addSchedule(input))
  ipcMain.handle("schedules:remove", (_event, id: string) => removeSchedule(id))
  ipcMain.handle("schedules:toggle", (_event, id: string, enabled: boolean) => toggleSchedule(id, enabled))
  ipcMain.handle("schedules:run-now", (_event, id: string) => runScheduleNow(id))
  ipcMain.handle("provider-secrets:list", () => listProviderSecrets())
  ipcMain.handle("provider-secrets:save", (_event, id: string, value: string) => saveProviderSecret(id, value))
  ipcMain.handle("provider-secrets:save-settings", async (_event, id: string, baseUrl: string, modelId: string) => { await saveProviderSettings(id, baseUrl, modelId) })
  ipcMain.handle("provider-secrets:remove", (_event, id: string) => removeProviderSecret(id))
  ipcMain.handle("provider-secrets:test", (_event, id: string) => testProvider(id))
  ipcMain.handle("providers:add", async (_event, label: string, baseUrl: string, modelId: string) => { await addCustomProvider(label, baseUrl, modelId) })
  ipcMain.handle("providers:remove", async (_event, id: string) => { await removeCustomProvider(id) })

  ipcMain.handle("telegram:status", (_event, probe?: boolean) => deps.telegram().status({ probe: probe === true }))
  ipcMain.handle("telegram:connect", async (_event, token: string) => deps.telegram().connect(token))
  ipcMain.handle("telegram:reconnect", () => deps.telegram().reconnect())
  ipcMain.handle("telegram:disconnect", () => deps.telegram().disconnect())
  ipcMain.handle("telegram:forget-token", async () => { await deps.telegram().forgetToken(); return { ok: true } })
  ipcMain.handle("telegram:send", async (_event, chatId: string, text: string) => deps.telegram().send(chatId, text))
  ipcMain.handle("telegram:allowed-chats", () => deps.telegram().allowedChats())
  ipcMain.handle("telegram:pending-chats", () => deps.telegram().pendingChats())
  ipcMain.handle("telegram:chats", () => deps.telegram().chats())
  ipcMain.handle("telegram:set-allowed-chats", async (_event, chatIds: string[]) => deps.telegram().setAllowedChats(chatIds))
  ipcMain.handle("telegram:approve-chat", async (_event, chatId: string) => deps.telegram().approveChat(chatId))
  ipcMain.handle("telegram:deny-chat", async (_event, chatId: string) => deps.telegram().denyChat(chatId))
  ipcMain.handle("telegram:revoke-chat", async (_event, chatId: string) => deps.telegram().revokeChat(chatId))
  ipcMain.handle("telegram:set-auto-approve-first", async (_event, enabled: boolean) => deps.telegram().setAutoApproveFirst(enabled))
  ipcMain.handle("local-studio:status", () => deps.localStudio().snapshot())
  ipcMain.handle("local-studio:set-url", (_event, baseUrl: string) => deps.localStudio().setBaseURL(baseUrl))
  ipcMain.handle("host-controls:browser-status", () => hostBrowserStatus())
  ipcMain.handle("host-controls:browser-open", (_event, url: string) => hostBrowserOpen(url))
  ipcMain.handle("host-controls:desktop-status", () => hostDesktopStatus())
  ipcMain.handle("projects:list", async () => Promise.all(listProjects().map(inspectProject)))
  ipcMain.handle("projects:add", async (_event, path: string) => addProject(path))
  ipcMain.handle("projects:remove", (_event, id: string) => removeProject(id))
  ipcMain.handle("projects:scratch", async () => {
    const path = join(app.getPath("userData"), "Scratch")
    mkdirSync(path, { recursive: true })
    // Idempotent: if the Scratch project is already registered, return its
    // snapshot so the renderer can select it without duplicating the entry.
    const existing = listProjects().find((project) => project.path === path)
    if (existing) return inspectProject(existing)
    return addProject(path)
  })
  ipcMain.handle("workspace:files", (_event, root: string) => listWorkspaceFiles(root))
  ipcMain.handle("workspace:read", (_event, root: string, path: string) => readWorkspaceFile(root, path))
  ipcMain.handle("workspace:write", (_event, root: string, path: string, content: string) => writeWorkspaceFile(root, path, content))
  ipcMain.handle("workspace:command", (_event, root: string, command: string) => runWorkspaceCommand(root, command))
  ipcMain.handle("workspace:git-changes", (_event, root: string) => gitChangedFiles(root))
  ipcMain.handle("workspace:git-diff", (_event, root: string, path: string) => gitFileDiff(root, path))
  ipcMain.handle("workspace:git-action", (_event, root: string, path: string, action: "stage" | "unstage" | "discard") => applyGitFileAction(root, path, action))
  ipcMain.handle("workspace:git-worktrees", (_event, root: string) => gitWorktrees(root))
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
    if (previousPreviewScreenshot && previousPreviewScreenshot !== screenshotPath) await unlink(previousPreviewScreenshot).catch(() => undefined)
    previousPreviewScreenshot = screenshotPath
    return { ...page, screenshotPath }
  })

  ipcMain.handle("store:get", (_event, key: string) => {
    if (isRendererForbiddenStoreKey(key)) throw new Error("Telegram credentials are not readable from the renderer")
    return getStore().get(key)
  })
  ipcMain.handle("store:set", (_event, key: string, value: unknown) => {
    if (isRendererForbiddenStoreKey(key)) throw new Error("Telegram credentials cannot be written from the renderer")
    getStore().set(key, value)
  })
  ipcMain.handle("store:delete", (_event, key: string) => {
    if (isRendererForbiddenStoreKey(key)) throw new Error("Telegram credentials cannot be deleted from the renderer")
    getStore().delete(key)
  })
  ipcMain.handle("window:minimize", () => deps.getMainWindow()?.minimize())
  ipcMain.handle("window:maximize", () => {
    const win = deps.getMainWindow()
    if (win?.isMaximized()) win.unmaximize(); else win?.maximize()
  })
  ipcMain.handle("window:close", () => deps.getMainWindow()?.close())
  ipcMain.handle("app:open-external", async (_event, url: string) => {
    // All `shell.openExternal` calls funnel through `safeOpenExternal` so
    // a hostile renderer-supplied URL cannot regress the protocol floor.
    try {
      await safeOpenExternal(url)
    } catch (error) {
      if (error instanceof UnsafeExternalUrlError) throw new Error("Only HTTP(S) links can be opened")
      throw error
    }
  })
  ipcMain.handle("app:get-version", () => app.getVersion())
  ipcMain.handle("app:backend-repository", () => "https://github.com/xai-org/grok-build")
  ipcMain.handle("app:notify", (_event, input: { kind: "success" | "error"; title: string; body: string }) => {
    const notification = normalizeDesktopNotification(input)
    const main = deps.getMainWindow()
    if (!notification || !Notification.isSupported() || !main || main.isDestroyed() || main.isFocused()) return { shown: false }
    const native = new Notification({ title: notification.title, body: notification.body })
    native.on("click", () => {
      if (main.isDestroyed()) return
      if (main.isMinimized()) main.restore()
      main.show()
      main.focus()
    })
    native.show()
    return { shown: true }
  })
  ipcMain.handle("dialog:open-file", async (_event, options?: { filters?: { name: string; extensions: string[] }[] }) =>
    dialog.showOpenDialog({ properties: ["openFile"], filters: options?.filters }))
  ipcMain.handle("dialog:open-directory", async () => dialog.showOpenDialog({ properties: ["openDirectory"] }))

  // Browser Agent IPC handlers
  ipcMain.handle("browser:status", async () => browserManager.status())
  ipcMain.handle("browser:nav", async (_event, url: string) => browserManager.nav(url))
  ipcMain.handle("browser:snapshot", async () => browserManager.snapshot())
  ipcMain.handle("browser:click", async (_event, selector: string) => browserManager.click(selector))
  ipcMain.handle("browser:type", async (_event, selector: string, text: string) => browserManager.type(selector, text))
  ipcMain.handle("browser:screenshot", async () => browserManager.screenshot())
  ipcMain.handle("browser:save-screenshot", async (_event, dataUrl: string) => {
    if (typeof dataUrl !== "string" || dataUrl.length > 20_000_000) throw new Error("Invalid browser screenshot")
    const encoded = dataUrl.match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/)?.[1]
    if (!encoded) throw new Error("Browser screenshot must be a PNG data URL")
    const screenshotPath = join(app.getPath("temp"), `grok-browser-agent-${Date.now()}.png`)
    await writeFile(screenshotPath, Buffer.from(encoded, "base64"))
    if (previousBrowserAgentScreenshot && previousBrowserAgentScreenshot !== screenshotPath) await unlink(previousBrowserAgentScreenshot).catch(() => {})
    previousBrowserAgentScreenshot = screenshotPath
    return screenshotPath
  })
  ipcMain.handle("browser:stop", async () => browserManager.stop())

  writeLog("info", "IPC handlers registered")
}
