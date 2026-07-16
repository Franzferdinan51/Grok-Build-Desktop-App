/**
 * main/index.ts — Electron main process entry point
 *
 * Mirrors the opencode pattern:
 *   https://github.com/sst/opencode/blob/dev/packages/desktop/src/main/index.ts
 *
 * Responsibilities:
 *  - App lifecycle (ready, quit)
 *  - Window creation & management
 *  - IPC handler registration
 *  - Grok Build execution backend lifecycle
 */

import { app, BrowserWindow, Menu } from "electron"
import { mkdirSync } from "fs"
import { join } from "path"
import windowStateKeeper from "electron-window-state"
import { registerIpcHandlers } from "./ipc"
import { GrokBuildBackend } from "./grok-build-backend"
import { TelegramBridge } from "./telegram"
import { LocalStudioController } from "./local-studio"
import { initLogging, write as writeLog } from "./logging"
import { createMenu } from "./menu"
import { GrokTaskScheduler } from "./scheduled-tasks"
import { PreviewServer } from "./preview-server"
import { getStore } from "./store"
import { finishGrokRun, startGrokRun } from "./grok-runs"

const APP_NAME = "Grok Build Desktop"
const APP_ID = "ai.grokbuild.desktop"

let mainWindow: BrowserWindow | null = null
const backend = new GrokBuildBackend()
const telegram = new TelegramBridge()
const localStudio = new LocalStudioController()
const scheduler = new GrokTaskScheduler(backend)
const preview = new PreviewServer()
let logger: ReturnType<typeof initLogging>
let updateTimer: ReturnType<typeof setInterval> | undefined
let telegramTaskCancelled = false

// ── Window factory ────────────────────────────────────────────────────────────

function createMainWindow(): BrowserWindow {
  const state = windowStateKeeper({
    defaultWidth: 1280,
    defaultHeight: 800,
  })

  const win = new BrowserWindow({
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
    minWidth: 900,
    minHeight: 600,
    title: APP_NAME,
    backgroundColor: "#0d0d0f",
    show: false, // show after ready-to-show
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  })

  state.manage(win)

  win.once("ready-to-show", () => {
    win.show()
    writeLog("info", `Window ready, pid=${process.pid}`)
  })

  win.on("closed", () => {
    mainWindow = null
  })

  return win
}

async function createAndLoadMainWindow(): Promise<BrowserWindow> {
  const win = createMainWindow()
  mainWindow = win
  if (process.env.ELECTRON_RENDERER_URL) await win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else await win.loadFile(join(__dirname, "../renderer/index.html"))
  return win
}

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  logger = initLogging()
  writeLog("info", `${APP_NAME} starting — pid=${process.pid}`)

  // Register all IPC handlers before window creation
  registerIpcHandlers({
    backend: () => backend,
    telegram: () => telegram,
    localStudio: () => localStudio,
    getMainWindow: () => mainWindow,
    preview: () => preview,
  })

  telegram.setMessageHandler(async (chatId, text) => {
    const modelChoice = text.match(/^pick_model:(\d+)$/)
    if (modelChoice) {
      const catalog = await backend.models(); const selected = catalog.models[Number(modelChoice[1])]
      if (!selected) return "That model is no longer available. Open /models again."
      getStore().set("defaults.model", selected); return `✓ Model set to ${selected}`
    }
    const projectChoice = text.match(/^pick_project:(\d+)$/)
    if (projectChoice) {
      const selected = getStore().get("projects")[Number(projectChoice[1])]
      if (!selected) return "That project is no longer available. Open /projects again."
      getStore().set("workspace.last", selected.path); return `✓ Workspace set to ${selected.name}\n${selected.path}`
    }
    if (text === "menu:models") text = "/models"
    if (text === "menu:projects") text = "/projects"
    if (text === "menu:status") text = "/status"
    if (text === "menu:cancel") text = "/cancel"
    const command = text.match(/^\/(\w+)(?:@\w+)?(?:\s+([\s\S]*))?$/)
    const name = command?.[1]?.toLowerCase()
    const argument = command?.[2]?.trim() || ""
    const help = "Grok Build Desktop\n\n/run <task> — run a coding task\n/status — backend status\n/models — choose a model\n/projects — choose a workspace\n/workspace — active workspace\n/cancel — stop the current task\n\nPlain messages also run as tasks."
    const menu = { text: help, buttons: [[{ text: "🤖 Models", data: "menu:models" }, { text: "📁 Projects", data: "menu:projects" }], [{ text: "📊 Status", data: "menu:status" }, { text: "⏹ Cancel", data: "menu:cancel" }]] }
    if (name === "start" || name === "help" || name === "menu") return menu
    if (name === "cancel") {
      const wasRunning = backend.isRunning()
      if (wasRunning) telegramTaskCancelled = true
      backend.cancel()
      return wasRunning ? "Stopping the active Grok Build task…" : "No Grok Build task is currently running."
    }
    if (name === "workspace") return `Active workspace: ${(getStore().get("workspace.last") as string | undefined) || "Scratch"}`
    if (name === "status") {
      const status = await backend.status()
      return status.available ? `Grok Build ready${status.version ? ` · ${status.version}` : ""}${backend.isRunning() ? " · task running" : " · idle"}` : `Grok Build unavailable: ${status.error}`
    }
    if (name === "models") {
      const catalog = await backend.models()
      const current = (getStore().get("defaults.model") as string | undefined) || catalog.defaultModel || "Grok Build default"
      return { text: `Choose a model\nCurrent: ${current}`, buttons: catalog.models.slice(0, 30).map((entry, index) => [{ text: `${entry === current ? "✓ " : ""}${entry}`.slice(0, 60), data: `pick_model:${index}` }]) }
    }
    if (name === "model") {
      if (!argument) return "Usage: /model <name>\nUse /models to see available models."
      const catalog = await backend.models()
      if (!catalog.models.includes(argument)) return `Unknown model: ${argument}\nUse /models to see available models.`
      getStore().set("defaults.model", argument)
      return `Default model set to ${argument}.`
    }
    if (name === "projects") {
      const projects = getStore().get("projects")
      const current = getStore().get("workspace.last") as string | undefined
      if (!projects.length) return "No projects yet. Add one in the desktop app, or use Scratch."
      return { text: "Choose the workspace used by Telegram tasks:", buttons: projects.slice(0, 30).map((project, index) => [{ text: `${project.path === current ? "✓ " : ""}${project.name}`.slice(0, 60), data: `pick_project:${index}` }]) }
    }
    if (name && name !== "run") return `Unknown command /${name}.\n\n${help}`
    const taskText = name === "run" ? argument : text
    if (!taskText) return "Usage: /run <task>"
    if (backend.isRunning()) return "Grok Build is busy with another task. Try again when the current run finishes."
    const storedWorkspace = getStore().get("workspace.last") as string | undefined
    const cwd = storedWorkspace || join(app.getPath("userData"), "Scratch")
    mkdirSync(cwd, { recursive: true })
    let response = ""
    const input = { prompt: taskText.slice(0, 20_000), cwd, model: getStore().get("defaults.model") as string | undefined, permissionMode: "auto" as const, noPlan: true }
    telegramTaskCancelled = false
    const run = startGrokRun(input)
    const startedAt = Date.now()
    const workspaceName = getStore().get("projects").find((project) => project.path === cwd)?.name || "Scratch"
    const modelName = input.model || "Grok Build default"
    await telegram.sendActivity(chatId)
    const progressId = await telegram.sendProgress(chatId, `🚀 Task started\nModel: ${modelName}\nWorkspace: ${workspaceName}`)
    let stage = "🧠 Grok Build is reasoning"
    let lastProgress = ""
    let progressPending = false
    const elapsed = () => {
      const seconds = Math.max(1, Math.floor((Date.now() - startedAt) / 1000))
      return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`
    }
    const updateProgress = (nextStage = stage) => {
      stage = nextStage
      const message = `${stage}…\nElapsed: ${elapsed()}\nModel: ${modelName}`
      if (message === lastProgress || progressPending) return
      lastProgress = message
      progressPending = true
      void telegram.editProgress(chatId, progressId, message).finally(() => { progressPending = false })
    }
    const activityTimer = setInterval(() => { void telegram.sendActivity(chatId); updateProgress() }, 7_000)
    activityTimer.unref()
    try {
      await backend.run(input, (event) => {
        if (event.type === "text" && typeof event.data === "string") { response += event.data; updateProgress("✍️ Grok Build is preparing the response") }
        else if (event.type === "thought") updateProgress("🧠 Grok Build is reasoning")
        else if (event.type.toLowerCase().includes("tool")) updateProgress("🔧 Grok Build is using workspace tools")
      })
      if (telegramTaskCancelled) {
        finishGrokRun(run.id, { status: "cancelled" })
        await telegram.editProgress(chatId, progressId, `⏹ Task cancelled\nTime: ${elapsed()}\nModel: ${modelName}`)
        return "Task cancelled."
      }
      finishGrokRun(run.id, { status: "completed" })
      await telegram.editProgress(chatId, progressId, `✅ Task finished\nTime: ${elapsed()}\nModel: ${modelName}`)
    } catch (error) {
      finishGrokRun(run.id, { status: "failed", error: error instanceof Error ? error.message : String(error) })
      await telegram.editProgress(chatId, progressId, `❌ Task failed\nTime: ${elapsed()}\nModel: ${modelName}`)
      throw error
    } finally {
      clearInterval(activityTimer)
    }
    return response.trim().slice(0, 4096) || "Task completed without a text response."
  })
  telegram.start()

  mainWindow = await createAndLoadMainWindow()

  // Set up app menu
  const menu = createMenu(mainWindow)
  Menu.setApplicationMenu(menu)
  scheduler.start()
  const autoUpdate = async () => {
    if (!getStore().get("grok.autoUpdate") || backend.isRunning()) return
    try {
      const update = await backend.checkUpdate()
      if (update.updateAvailable) {
        const attemptedTarget = getStore().get("grok.lastAutoUpdateTarget") as string | undefined
        if (attemptedTarget === `${update.channel}:${update.latestVersion}`) return
        writeLog("info", `Updating Grok Build ${update.currentVersion} → ${update.latestVersion} (${update.channel})`)
        await backend.installUpdate((getStore().get("grok.updateChannel") as "stable" | "alpha" | undefined) || "stable")
        getStore().set("grok.lastAutoUpdateTarget", `${update.channel}:${update.latestVersion}`)
      }
    } catch (error) { writeLog("error", `Automatic Grok Build update failed: ${String(error)}`) }
  }
  updateTimer = setInterval(() => void autoUpdate(), 6 * 60 * 60_000)
  setTimeout(() => void autoUpdate(), 30_000)

  app.on("activate", () => {
    // macOS: re-create window when dock icon is clicked and no windows exist
    if (BrowserWindow.getAllWindows().length === 0) {
      void createAndLoadMainWindow().catch((error) => writeLog("error", `Could not reopen window: ${String(error)}`))
    }
  })
})

app.on("window-all-closed", () => {
  // Quit on all platforms when all windows are closed
  if (process.platform !== "darwin") {
    app.quit()
  }
})

app.on("before-quit", async () => {
  writeLog("info", "App quitting — stopping Grok Build task")
  await backend.shutdown()
  scheduler.stop()
  if (updateTimer) clearInterval(updateTimer)
  await preview.stop()
})
