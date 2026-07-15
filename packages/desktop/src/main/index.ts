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
 *  - Grok CLI sidecar lifecycle (download on first run, spawn, kill)
 */

import { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage } from "electron"
import { join } from "path"
import { registerIpcHandlers } from "./ipc"
import { GrokSidecarManager } from "./sidecar"
import { getStore } from "./store"
import { initLogging, write as writeLog } from "./logging"
import { createMenu } from "./menu"

const APP_NAME = "Grok Build Desktop"
const APP_ID = "ai.grokbuild.desktop"

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let sidecar: GrokSidecarManager | null = null
let logger: ReturnType<typeof initLogging>

// ── Window factory ────────────────────────────────────────────────────────────

function createMainWindow(): BrowserWindow {
  const { windowStateKeeper } = require("electron-window-state") as typeof import("electron-window-state")

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

// ── Grok Sidecar ─────────────────────────────────────────────────────────────

async function startSidecar(): Promise<void> {
  sidecar = new GrokSidecarManager({
    // Download grok binary on first run if not found
    downloadIfMissing: true,
    // Prefer fork at https://github.com/Franzferdinan51/grok-build
    forkUrl: "https://github.com/Franzferdinan51/grok-build",
  })

  await sidecar.start()
  writeLog("info", "Grok sidecar started")
}

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  logger = initLogging()
  writeLog("info", `${APP_NAME} starting — pid=${process.pid}`)

  // Register all IPC handlers before window creation
  registerIpcHandlers({
    sidecar: () => sidecar,
    getMainWindow: () => mainWindow,
  })

  mainWindow = createMainWindow()

  // Load the renderer
  if (process.env.ELECTRON_RENDERER_URL) {
    // Dev mode — Vite dev server URL
    await mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    // Prod mode — built files
    await mainWindow.loadFile(join(__dirname, "../renderer/index.html"))
  }

  // Set up app menu
  const menu = createMenu(mainWindow)
  Menu.setApplicationMenu(menu)

  // Start Grok sidecar in background
  startSidecar().catch((err) => {
    writeLog("error", `Sidecar start failed: ${err.message}`)
  })

  app.on("activate", () => {
    // macOS: re-create window when dock icon is clicked and no windows exist
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow()
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
  writeLog("info", "App quitting — stopping sidecar")
  await sidecar?.stop()
  sidecar = null
})
