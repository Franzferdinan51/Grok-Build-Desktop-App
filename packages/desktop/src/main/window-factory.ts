/**
 * window-factory.ts — Main BrowserWindow constructor + lifecycle.
 *
 * Centralises every Electron BrowserWindow knob the desktop uses so the
 * preview pane, future pop-out windows, or the workbench itself can be
 * created with the same hardened defaults (context isolation, sandbox,
 * no nodeIntegration, fixed preload). Previously this lived inline in
 * `main/index.ts` mixed with the IPC + Telegram dispatcher wiring.
 */

import { BrowserWindow, app } from "electron"
import { join } from "path"
import windowStateKeeper from "electron-window-state"
import { write as writeLog } from "./logging"

export const APP_NAME = "Grok Build Desktop"

export type MainWindowOptions = {
  onClosed?: () => void
}

export const appIconPath = (): string => app.isPackaged
  ? join(process.resourcesPath, "icon.png")
  : join(__dirname, "../../resources/icon.png")

export function createMainWindow(opts: MainWindowOptions = {}): BrowserWindow {
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
    icon: appIconPath(),
    backgroundColor: "#0d0d0f",
    show: false, // show after ready-to-show
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      // The Browser Agent owns its embedded browsing surface. It remains
      // sandboxed with Node disabled; navigation is still mediated by the
      // Browser Agent's separate Playwright/BrowserOS control channel.
      webviewTag: true,
    },
  })

  state.manage(win)

  win.once("ready-to-show", () => {
    win.show()
    writeLog("info", `Window ready, pid=${process.pid}`)
  })

  win.on("closed", () => {
    if (opts.onClosed) opts.onClosed()
  })

  return win
}

export function createQuickEntryWindow(opts: { onClosed?: () => void } = {}): BrowserWindow {
  const win = new BrowserWindow({ width: 720, height: 188, minWidth: 520, minHeight: 160, maxWidth: 980, maxHeight: 260, show: false, frame: false, resizable: true, alwaysOnTop: true, skipTaskbar: true, backgroundColor: "#0d0f14", title: "Grok Build Quick Entry", icon: appIconPath(), webPreferences: { preload: join(__dirname, "../preload/index.js"), nodeIntegration: false, contextIsolation: true, sandbox: true } })
  win.on("closed", () => opts.onClosed?.())
  return win
}

/**
 * Load the renderer entry point. In dev the renderer URL is provided by
 * the HMR server (`process.env.ELECTRON_RENDERER_URL`); in production the
 * bundled `index.html` is loaded from the same out/ directory as the
 * compiled main process.
 */
export async function loadRenderer(win: BrowserWindow): Promise<void> {
  if (process.env.ELECTRON_RENDERER_URL) await win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else await win.loadFile(join(__dirname, "../renderer/index.html"))
}

export async function loadQuickEntryRenderer(win: BrowserWindow): Promise<void> {
  if (process.env.ELECTRON_RENDERER_URL) await win.loadURL(`${process.env.ELECTRON_RENDERER_URL}?quick-entry=1`)
  else await win.loadFile(join(__dirname, "../renderer/index.html"), { query: { "quick-entry": "1" } })
}

/**
 * Wrap a single-instance check + focus-existing-window dance. Returns
 * `true` when the current process owns the lock and should continue
 * initialising; `false` when a sibling instance already runs and the
 * app should exit.
 */
export function acquireSingleInstanceLock(onSecondInstance: () => void): boolean {
  const gotLock = app.requestSingleInstanceLock()
  if (!gotLock) return false
  app.on("second-instance", onSecondInstance)
  return true
}
