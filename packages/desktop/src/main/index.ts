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

import { app, BrowserWindow, Menu, globalShortcut, screen, session } from "electron"
import { registerIpcHandlers } from "./ipc"
import { GrokBuildBackend } from "./grok-build-backend"
import { TelegramBridge } from "./telegram"
import { LocalStudioController } from "./local-studio"
import { initLogging, write as writeLog } from "./logging"
import { createMenu } from "./menu"
import { GrokTaskScheduler } from "./scheduled-tasks"
import { PreviewServer } from "./preview-server"
import { getStore } from "./store"
import { recoverInterruptedGrokRuns } from "./grok-runs"
import { createAgentHandler, saveAgentSession } from "./telegram/agent-handler"
import { buildAgentInput } from "./telegram/agent-input"
import { acquireSingleInstanceLock, appIconPath, createMainWindow, createQuickEntryWindow, loadQuickEntryRenderer, loadRenderer, APP_NAME } from "./window-factory"
import { installBundledSkills } from "./bundled-skills"
import { DEFAULT_QUICK_ENTRY_ACCELERATOR, validateQuickEntryAccelerator } from "./quick-entry"

let mainWindow: BrowserWindow | null = null
let quickEntryWindow: BrowserWindow | null = null
const backend = new GrokBuildBackend()
const telegram = new TelegramBridge()
const localStudio = new LocalStudioController()
const scheduler = new GrokTaskScheduler(backend)
const preview = new PreviewServer()
let _logger: ReturnType<typeof initLogging>
let updateTimer: ReturnType<typeof setInterval> | undefined
let telegramTaskCancelled = false
let telegramRunningChat = ""
let telegramTaskReserved = false
let telegramDrainTimer: ReturnType<typeof setTimeout> | undefined
const telegramQueue: { chatId: string; text: string; queuedAt: number }[] = []
const BROWSER_AGENT_PARTITION = "persist:grok-browser-agent"
const BROWSER_AGENT_USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"

function configureBrowserAgentSession(): void {
  session.fromPartition(BROWSER_AGENT_PARTITION).setUserAgent(BROWSER_AGENT_USER_AGENT)
  app.on("web-contents-created", (_event, contents) => {
    if (contents.getType() !== "webview") return
    contents.setWindowOpenHandler(({ url }) => {
      if (!/^https?:\/\//i.test(url)) return { action: "deny" }
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          title: "Sign in — Grok Browser",
          width: 560,
          height: 760,
          minWidth: 420,
          minHeight: 560,
          backgroundColor: "#0d0d0f",
          webPreferences: {
            partition: BROWSER_AGENT_PARTITION,
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
          },
        },
      }
    })
  })
}

// Single-instance lock: a second launch would start a second Telegram polling
// loop on the same bot token (Telegram allows only one getUpdates owner) and
// race on the same settings file. Focus the existing window instead.
if (process.env.GROK_BUILD_UI_SMOKE !== "1" && !acquireSingleInstanceLock(() => {
  // Focus the existing window on the second launch.
  const windows = BrowserWindow.getAllWindows()
  if (windows.length) {
    const [win] = windows
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  }
})) {
  writeLog("info", "Another Grok Build Desktop instance is already running. Exiting.")
  app.quit()
}

// Surface any unhandled async failure to the log instead of letting it die
// silently. Without this a stray rejection in Telegram polling or the scheduler
// could leave the app in a half-alive state with no diagnostic trail.
process.on("unhandledRejection", (reason) => {
  writeLog("error", `Unhandled rejection: ${reason instanceof Error ? `${reason.message}\n${reason.stack ?? ""}` : String(reason)}`)
})
process.on("uncaughtException", (error) => {
  writeLog("error", `Uncaught exception: ${error.message}\n${error.stack ?? ""}`)
})

// ── App lifecycle ─────────────────────────────────────────────────────────────

type TelegramAgentSession = {
  sessionId?: string; model?: string; workspace?: string; updatedAt: number
  transcript?: { role: "user" | "assistant"; text: string }[]
  lastTask?: string; compressedSummary?: string; thinking?: boolean; mode?: "fast" | "balanced" | "deep"
}
const telegramSession = (chatId: string): TelegramAgentSession => getStore().get("telegram").sessions?.[chatId] || { updatedAt: Date.now() }

async function createAndLoadMainWindow(): Promise<BrowserWindow> {
  const win = createMainWindow({ onClosed: () => { mainWindow = null } })
  mainWindow = win
  await loadRenderer(win)
  return win
}

async function showQuickEntry(): Promise<void> {
  if (!quickEntryWindow || quickEntryWindow.isDestroyed()) {
    quickEntryWindow = createQuickEntryWindow({ onClosed: () => { quickEntryWindow = null } })
    await loadQuickEntryRenderer(quickEntryWindow)
    quickEntryWindow.on("blur", () => { if (!quickEntryWindow?.isDestroyed()) quickEntryWindow?.hide() })
  }
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const bounds = quickEntryWindow.getBounds()
  quickEntryWindow.setPosition(Math.round(display.workArea.x + (display.workArea.width - bounds.width) / 2), Math.round(display.workArea.y + display.workArea.height * 0.16))
  quickEntryWindow.show(); quickEntryWindow.focus()
}

app.whenReady().then(async () => {
  _logger = initLogging()
  writeLog("info", `${APP_NAME} starting — pid=${process.pid}`)
  try { const installedSkills = await installBundledSkills(); if (installedSkills) writeLog("info", `Installed ${installedSkills} bundled Grok skills`) } catch (error) { writeLog("warn", `Bundled skill install skipped: ${String(error)}`) }
  try { recoverInterruptedGrokRuns() } catch (error) { writeLog("error", `Interrupted run recovery failed: ${String(error)}`) }
  if (process.platform === "darwin" && app.dock) app.dock.setIcon(appIconPath())
  configureBrowserAgentSession()

  // Telegram agent dispatcher + queue runner. The dispatcher logic moved
  // to `telegram/agent-handler.ts` so the ~280 branches can be tested
  // in isolation; this block wires the queue + flags the factory expects.
  const agentHandler = createAgentHandler({
    backend,
    telegram,
    queue: telegramQueue,
    getReserved: () => telegramTaskReserved,
    setReserved: (v) => { telegramTaskReserved = v },
    getCancelled: () => telegramTaskCancelled,
    setCancelled: (v) => { telegramTaskCancelled = v },
    getRunningChat: () => telegramRunningChat,
    setRunningChat: (v) => { telegramRunningChat = v },
    session: telegramSession,
    saveSession: saveAgentSession,
    scheduleNextTask: () => queueMicrotask(() => void processNextTelegramTask()),
    buildInput: async (chatId, taskText, agent) => buildAgentInput(chatId, taskText, agent),
  })
  writeLog("info", "Telegram agent handler ready")
  const processNextTelegramTask = async (): Promise<void> => {
    if (backend.isRunning() || telegramTaskReserved) {
      if (telegramQueue.length && !telegramDrainTimer) {
        telegramDrainTimer = setTimeout(() => {
          telegramDrainTimer = undefined
          void processNextTelegramTask()
        }, 2_000)
        telegramDrainTimer.unref()
      }
      return
    }
    const next = telegramQueue.shift()
    if (!next) return
    try {
      const reply = await agentHandler.handleMessage(next.chatId, next.text)
      if (typeof reply === "string") await telegram.sendLong(next.chatId, reply)
      else await telegram.sendReply(next.chatId, reply)
    } catch (error) {
      try {
        await telegram.sendLong(next.chatId, `Queued task failed: ${error instanceof Error ? error.message : String(error)}`)
      } catch (sendError) {
        writeLog("error", `Telegram queue error for ${next.chatId}: ${error instanceof Error ? error.message : String(error)}; send failed: ${sendError instanceof Error ? sendError.message : String(sendError)}`)
      }
    } finally {
      if (telegramQueue.length) queueMicrotask(() => void processNextTelegramTask())
    }
  }
  telegram.setMessageHandler(agentHandler.handleMessage)

  // Register all IPC handlers before window creation
  registerIpcHandlers({
    backend: () => backend,
    telegram: () => telegram,
    localStudio: () => localStudio,
    getMainWindow: () => mainWindow,
    getQuickEntryWindow: () => quickEntryWindow,
    preview: () => preview,
    onBackendIdle: () => queueMicrotask(() => void processNextTelegramTask()),
  })
  writeLog("info", "Creating main window")

  mainWindow = await createAndLoadMainWindow()
  writeLog("info", "Main window renderer loaded")

  // Set up app menu
  const menu = createMenu(mainWindow)
  Menu.setApplicationMenu(menu)
  const quickEntryAccelerator = validateQuickEntryAccelerator((getStore().get("quickEntry.accelerator") as string | undefined) || DEFAULT_QUICK_ENTRY_ACCELERATOR)
  if (!globalShortcut.register(quickEntryAccelerator, () => void showQuickEntry())) writeLog("warn", `Quick Entry shortcut unavailable: ${quickEntryAccelerator}`)
  else writeLog("info", `Quick Entry shortcut registered: ${quickEntryAccelerator}`)
  // safeStorage may trigger a macOS Keychain approval dialog when an ad-hoc
  // development build gets a new signature. Start Telegram only after the
  // main window is visible so that prompt can never make the app appear dead.
  telegram.onChange(() => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    mainWindow.webContents.send("telegram:changed")
  })
  telegram.start()
  scheduler.start()
  // Auto-update is now single-flight: a 6h `setInterval` and the 30s
  // warmup `setTimeout` can land in either order, and `installUpdate`
  // may take up to 10 minutes. Without the inflight guard, a long update
  // race-fires the very next tick and re-tries the install.
  let autoUpdateInFlight: Promise<void> | null = null
  const autoUpdate = async () => {
    if (autoUpdateInFlight) return autoUpdateInFlight
    autoUpdateInFlight = (async () => {
      if (getStore().get("grok.autoUpdate") === false || backend.isRunning()) return
      try {
        const update = await backend.checkUpdate()
        if (update.updateAvailable) {
          const target = `${update.channel}:${update.latestVersion}`
          const attemptedTarget = getStore().get("grok.lastAutoUpdateTarget") as string | undefined
          const attemptedAt = Number(getStore().get("grok.lastAutoUpdateAttempt") as number | undefined) || 0
          // Skip when we already attempted this exact target — even across
          // channel updates the user might have just retried, so persist a
          // timestamp too. After seven days the user is assumed to want a
          // fresh attempt (e.g. the previous install failed mid-flight).
          if (attemptedTarget === target && Date.now() - attemptedAt < 7 * 24 * 60 * 60_000) return
          writeLog("info", `Updating Grok Build ${update.currentVersion} → ${update.latestVersion} (${update.channel})`)
          await backend.installUpdate((getStore().get("grok.updateChannel") as "stable" | "alpha" | undefined) || "stable")
          getStore().set("grok.lastAutoUpdateTarget", target)
          getStore().set("grok.lastAutoUpdateAttempt", Date.now())
          // The CLI binary on disk just changed: drop the cached flag/model
          // snapshots so the next run reflects the new version instead of
          // serving stale state from before the update.
          backend.invalidateModelsCache()
          backend.invalidateCliFlagsCache()
        }
      } catch (error) { writeLog("error", `Automatic Grok Build update failed: ${String(error)}`) }
    })()
    try { await autoUpdateInFlight } finally { autoUpdateInFlight = null }
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
  globalShortcut.unregisterAll()
  quickEntryWindow?.destroy(); quickEntryWindow = null
  await preview.stop()
})
