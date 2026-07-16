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

  telegram.setMessageHandler(async (_chatId, text) => {
    if (backend.isRunning()) return "Grok Build is busy with another task. Try again when the current run finishes."
    const storedWorkspace = getStore().get("workspace.last") as string | undefined
    const cwd = storedWorkspace || join(app.getPath("userData"), "Scratch")
    mkdirSync(cwd, { recursive: true })
    let response = ""
    const input = { prompt: text.slice(0, 20_000), cwd, model: getStore().get("defaults.model") as string | undefined }
    const run = startGrokRun(input)
    try {
      await backend.run(input, (event) => { if (event.type === "text" && typeof event.data === "string") response += event.data })
      finishGrokRun(run.id, { status: "completed" })
    } catch (error) {
      finishGrokRun(run.id, { status: "failed", error: error instanceof Error ? error.message : String(error) })
      throw error
    }
    return response.trim().slice(0, 4096) || "Task completed without a text response."
  })
  telegram.start()

  mainWindow = await createAndLoadMainWindow()

  // Set up app menu
  const menu = createMenu(mainWindow)
  Menu.setApplicationMenu(menu)
  scheduler.start()

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
  backend.cancel()
  scheduler.stop()
  await preview.stop()
})
