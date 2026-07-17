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
import { publicTelegramResponse } from "./telegram-output"
import { join } from "path"
import windowStateKeeper from "electron-window-state"
import { registerIpcHandlers } from "./ipc"
import { GrokBuildBackend } from "./grok-build-backend"
import { TelegramBridge } from "./telegram"
import { LocalStudioController } from "./local-studio"
import { initLogging, write as writeLog } from "./logging"
import { createMenu } from "./menu"
import { addSchedule, GrokTaskScheduler, listSchedules } from "./scheduled-tasks"
import { PreviewServer } from "./preview-server"
import { getStore } from "./store"
import { finishGrokRun, recoverInterruptedGrokRuns, startGrokRun } from "./grok-runs"
import { telegramTaskNeedsMoa } from "./telegram-agent-policy"

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
let telegramRunningChat = ""
let telegramTaskReserved = false
const telegramQueue: { chatId: string; text: string; queuedAt: number }[] = []

type TelegramAgentSession = {
  sessionId?: string; model?: string; workspace?: string; updatedAt: number
  transcript?: { role: "user" | "assistant"; text: string }[]
  lastTask?: string; compressedSummary?: string; thinking?: boolean
}
const telegramSession = (chatId: string): TelegramAgentSession => getStore().get("telegram").sessions?.[chatId] || { updatedAt: Date.now() }
const saveTelegramSession = (chatId: string, patch: Partial<TelegramAgentSession>): TelegramAgentSession => {
  const telegramSettings = getStore().get("telegram")
  const next = { ...telegramSession(chatId), ...patch, updatedAt: Date.now() }
  getStore().set("telegram", { ...telegramSettings, sessions: { ...telegramSettings.sessions, [chatId]: next } })
  return next
}

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
  recoverInterruptedGrokRuns()

  // Register all IPC handlers before window creation
  registerIpcHandlers({
    backend: () => backend,
    telegram: () => telegram,
    localStudio: () => localStudio,
    getMainWindow: () => mainWindow,
    preview: () => preview,
  })

  const handleTelegramAgentMessage = async (chatId: string, text: string): Promise<string | { text: string; buttons: { text: string; data: string }[][] }> => {
    const modelChoice = text.match(/^pick_model:(\d+)$/)
    if (modelChoice) {
      const catalog = await backend.models(); const selected = catalog.models[Number(modelChoice[1])]
      if (!selected) return "That model is no longer available. Open /models again."
      saveTelegramSession(chatId, { model: selected }); return `✓ Model set to ${selected}`
    }
    const projectChoice = text.match(/^pick_project:(\d+)$/)
    if (projectChoice) {
      const selected = getStore().get("projects")[Number(projectChoice[1])]
      if (!selected) return "That project is no longer available. Open /projects again."
      saveTelegramSession(chatId, { workspace: selected.path, sessionId: "", transcript: [], compressedSummary: "", lastTask: undefined }); return `✓ Project set to ${selected.name}\n${selected.path}\nStarted a fresh project session.`
    }
    const projectIdChoice = text.match(/^pick_project_id:([a-f0-9-]+)$/i)
    if (projectIdChoice) {
      const selected = getStore().get("projects").find((project) => project.id === projectIdChoice[1])
      if (!selected) return "That project is no longer available. Open /project again."
      saveTelegramSession(chatId, { workspace: selected.path, sessionId: "", transcript: [], compressedSummary: "", lastTask: undefined }); return `✓ Project set to ${selected.name}\n${selected.path}\nStarted a fresh project session.`
    }
    if (text === "pick_project_scratch") {
      const scratch = join(app.getPath("userData"), "Scratch")
      mkdirSync(scratch, { recursive: true }); saveTelegramSession(chatId, { workspace: scratch, sessionId: "", transcript: [], compressedSummary: "", lastTask: undefined })
      return `✓ Project set to Scratch\n${scratch}\nStarted a fresh project session.`
    }
    if (text === "pick_project_agent") {
      const workspace = join(app.getPath("userData"), "Agent Workspace")
      mkdirSync(workspace, { recursive: true }); saveTelegramSession(chatId, { workspace, sessionId: "", transcript: [], compressedSummary: "", lastTask: undefined })
      return `✓ Agent mode enabled\nWorking directory: ${workspace}\nThis is a persistent general-purpose workspace and is not tied to any project.`
    }
    if (text === "menu:models") text = "/models"
    if (text === "menu:projects") text = "/projects"
    if (text === "menu:status") text = "/status"
    if (text === "menu:cancel") text = "/cancel"
    if (text === "menu:new") text = "/new"
    if (text === "menu:queue") text = "/queue"
    const command = text.match(/^\/(\w+)(?:@\w+)?(?:\s+([\s\S]*))?$/)
    const name = command?.[1]?.toLowerCase()
    const argument = command?.[2]?.trim() || ""
    const help = "**Grok Build Desktop Agent**\n\n/run <task> — run an agent task\n/new — start a fresh session\n/status — detailed agent status\n/models — choose a model\n/project — choose Project, Scratch, or Agent mode\n/queue — show queued work\n/steer <task> — prioritize the next instruction\n/interrupt <task> — stop and redirect active work\n/retry — retry the previous instruction\n/undo — rewind the previous turn\n/compress — checkpoint and compact context\n/reasoning [on|off] — session reasoning control\n/history — recent visible conversation\n/schedules — scheduled agent work\n/cancel — stop the current task\n/restart — restart the desktop agent\n\nPlain messages continue the current agent session."
    const menu = { text: help, buttons: [[{ text: "🤖 Models", data: "menu:models" }, { text: "📁 Projects", data: "menu:projects" }], [{ text: "📊 Status", data: "menu:status" }, { text: "📥 Queue", data: "menu:queue" }], [{ text: "✨ New session", data: "menu:new" }, { text: "⏹ Cancel", data: "menu:cancel" }]] }
    if (name === "start" || name === "help" || name === "menu") return menu
    if (name === "new" || name === "reset") {
      saveTelegramSession(chatId, { sessionId: "", transcript: [], compressedSummary: "", lastTask: undefined })
      return "✨ Fresh agent session started. Your selected model and project are unchanged."
    }
    if (name === "queue") {
      const queued = telegramQueue.filter((entry) => entry.chatId === chatId)
      if (!queued.length) return backend.isRunning() ? "No additional work queued. One task is currently running." : "The agent queue is empty."
      return `Queued work (${queued.length}):\n${queued.map((entry, index) => `${index + 1}. ${entry.text.slice(0, 120)}`).join("\n")}`
    }
    if (name === "history") {
      const transcript = telegramSession(chatId).transcript || []
      if (!transcript.length) return "This agent session has no visible conversation history yet."
      return transcript.slice(-8).map((entry) => `${entry.role === "user" ? "You" : "Agent"}: ${entry.text.slice(0, 700)}`).join("\n\n")
    }
    if (name === "undo") {
      const agent = telegramSession(chatId)
      const transcript = agent.transcript || []
      if (transcript.length < 2) return "There is no completed turn to undo."
      saveTelegramSession(chatId, { transcript: transcript.slice(0, -2), sessionId: "", lastTask: undefined })
      return "↩️ Previous turn removed. The next message will continue from the restored visible context."
    }
    if (name === "compress") {
      const agent = telegramSession(chatId)
      const transcript = agent.transcript || []
      if (transcript.length < 4) return "The session is already compact."
      const summary = transcript.slice(0, -4).map((entry) => `${entry.role === "user" ? "User" : "Agent"}: ${entry.text.slice(0, 900)}`).join("\n").slice(-8_000)
      saveTelegramSession(chatId, { compressedSummary: summary, transcript: transcript.slice(-4), sessionId: "" })
      return `🗜️ Context checkpointed. Kept the latest ${Math.min(2, transcript.length / 2)} turns active and preserved earlier decisions in a bounded recovery summary.`
    }
    if (name === "reasoning") {
      const normalized = argument.toLowerCase()
      if (!normalized) return `Session reasoning: ${(telegramSession(chatId).thinking ?? ((getStore().get("defaults.thinking") as boolean | undefined) ?? true)) ? "on" : "off"}\nUse /reasoning on or /reasoning off.`
      if (!["on", "off", "high", "low"].includes(normalized)) return "Usage: /reasoning on|off"
      const enabled = normalized === "on" || normalized === "high"
      saveTelegramSession(chatId, { thinking: enabled })
      return `🧠 Session reasoning ${enabled ? "enabled" : "disabled"}.`
    }
    if (name === "retry") {
      const agent = telegramSession(chatId)
      if (!agent.lastTask) return "There is no previous instruction to retry."
      const transcript = agent.transcript || []
      saveTelegramSession(chatId, { transcript: transcript.slice(0, -2), sessionId: "" })
      return handleTelegramAgentMessage(chatId, agent.lastTask)
    }
    if (name === "schedules") {
      const schedules = listSchedules().filter((task) => task.enabled).slice(0, 20)
      if (!schedules.length) return "No scheduled agent work is enabled."
      return `Scheduled work:\n${schedules.map((task, index) => `${index + 1}. ${task.name} — ${new Date(task.nextRunAt).toLocaleString()}`).join("\n")}`
    }
    if (name === "steer" || name === "interrupt") {
      if (!argument) return `Usage: /${name} <instruction>`
      if (name === "interrupt" && telegramRunningChat === chatId) { telegramTaskCancelled = true; backend.cancel() }
      telegramQueue.unshift({ chatId, text: argument.slice(0, 20_000), queuedAt: Date.now() })
      queueMicrotask(() => void processNextTelegramTask())
      return name === "interrupt" ? "⏭ Interrupting current work; your instruction is next." : "↪️ Instruction prioritized for the next agent turn."
    }
    if (name === "cancel" || name === "stop") {
      const wasRunning = telegramRunningChat === chatId
      if (wasRunning) telegramTaskCancelled = true
      if (wasRunning) backend.cancel()
      return wasRunning ? "Stopping this chat’s active Grok Build task…" : "This chat does not own the active task."
    }
    if (name === "restart") {
      if (telegramRunningChat && telegramRunningChat !== chatId) return "Another chat owns the active task. Stop it there before restarting the agent."
      if (telegramRunningChat === chatId) { telegramTaskCancelled = true; backend.cancel() }
      setTimeout(() => {
        writeLog("info", `Telegram-authorized agent restart requested by chat ${chatId}`)
        app.relaunch()
        app.exit(0)
      }, 2_000).unref()
      return "🔄 Restarting Grok Build Desktop and its Telegram agent. I’ll resume polling automatically when it is back."
    }
    if (name === "workspace") return `Active working directory: ${telegramSession(chatId).workspace || (getStore().get("workspace.last") as string | undefined) || "Scratch"}`
    if (name === "status") {
      const status = await backend.status()
      const catalog = await backend.models()
      const agent = telegramSession(chatId)
      const model = agent.model || (getStore().get("defaults.model") as string | undefined) || catalog.defaultModel || "Grok Build default"
      const workspacePath = agent.workspace || (getStore().get("workspace.last") as string | undefined) || join(app.getPath("userData"), "Scratch")
      const workspace = workspacePath === join(app.getPath("userData"), "Agent Workspace") ? "Agent (no project)" : getStore().get("projects").find((project) => project.path === workspacePath)?.name || "Scratch"
      const moaOn = Boolean(getStore().get("moa.enabled"))
      const moaAggregator = (getStore().get("moa.aggregatorModel") as string | undefined) || model
      const moaLine = moaOn ? `\nMoA: Complex tasks → ${moaAggregator}; simple messages → ${model}` : "\nMoA: Off"
      if (!status.available) return `🔴 Grok Build unavailable\n${status.error}`
      return `🟢 Grok Build agent ready\n\nStatus: ${backend.isRunning() ? `Task running${telegramRunningChat === chatId ? " in this chat" : ""}` : "Idle"}\nSession: ${agent.sessionId ? "Resumable" : "Fresh"}\nDirect model: ${model}${moaLine}\nProject: ${workspace}\nBackend: ${status.version || "available"}\nModels: ${catalog.models.length}\n\nUse /new to reset, or /models and /project to change context.`
    }
    if (name === "models") {
      const catalog = await backend.models()
      const current = telegramSession(chatId).model || (getStore().get("defaults.model") as string | undefined) || catalog.defaultModel || "Grok Build default"
      return { text: `Choose a model\nCurrent: ${current}`, buttons: catalog.models.slice(0, 30).map((entry, index) => [{ text: `${entry === current ? "✓ " : ""}${entry}`.slice(0, 60), data: `pick_model:${index}` }]) }
    }
    if (name === "model") {
      if (!argument) return "Usage: /model <name>\nUse /models to see available models."
      const catalog = await backend.models()
      if (!catalog.models.includes(argument)) return `Unknown model: ${argument}\nUse /models to see available models.`
      saveTelegramSession(chatId, { model: argument })
      return `Default model set to ${argument}.`
    }
    if (name === "projects" || name === "project") {
      const projects = getStore().get("projects")
      const current = telegramSession(chatId).workspace || getStore().get("workspace.last") as string | undefined
      const scratch = join(app.getPath("userData"), "Scratch")
      const agentWorkspace = join(app.getPath("userData"), "Agent Workspace")
      return { text: "Choose where the agent works. Agent mode is persistent and does not require a project:", buttons: [
        [{ text: `${current === agentWorkspace ? "✓ " : ""}🤖 Agent (no project)`, data: "pick_project_agent" }],
        [{ text: `${current === scratch ? "✓ " : ""}Scratch`, data: "pick_project_scratch" }],
        ...projects.slice(0, 30).map((project) => [{ text: `${project.path === current ? "✓ " : ""}${project.name}`.slice(0, 60), data: `pick_project_id:${project.id}` }]),
      ] }
    }
    if (name && name !== "run") return `Unknown command /${name}.\n\n${help}`
    const taskText = name === "run" ? argument : text
    if (!taskText) return "Usage: /run <task>"
    if (backend.isRunning() || telegramTaskReserved) {
      telegramQueue.push({ chatId, text: taskText.slice(0, 20_000), queuedAt: Date.now() })
      return `📥 Task queued at position ${telegramQueue.length}. Use /queue to inspect it, /steer to prioritize work, or /interrupt to stop the active turn.`
    }
    let agent = telegramSession(chatId)
    const idleHours = Math.max(0, Number(getStore().get("agent.sessionIdleHours")) || 0)
    if (idleHours > 0 && Date.now() - agent.updatedAt > idleHours * 60 * 60_000) {
      saveTelegramSession(chatId, { sessionId: "", transcript: [], compressedSummary: "" })
      agent = telegramSession(chatId)
    }
    const storedWorkspace = agent.workspace || getStore().get("workspace.last") as string | undefined
    const cwd = storedWorkspace || join(app.getPath("userData"), "Scratch")
    mkdirSync(cwd, { recursive: true })
    let response = ""
    const transcript = agent.transcript || []
    const fallbackContext = [`Earlier checkpoint:\n${agent.compressedSummary || ""}`, ...transcript.slice(-10).map((entry) => `${entry.role === "user" ? "User" : "Assistant"}: ${entry.text}`)].filter((entry) => !entry.endsWith("\n")).join("\n\n").slice(-20_000)
    const appControls = Boolean(getStore().get("agent.appControls"))
    const agentPrompt = appControls
      ? `${taskText.slice(0, 20_000)}\n\n## Safe host actions\nWhen the user explicitly asks to schedule future work, append exactly one validated action tag to your answer:\n<app_action>{"type":"schedule.create","name":"Task name","prompt":"Task prompt","runAt":1770000000000,"repeatMinutes":60}</app_action>\nUse an absolute future Unix timestamp in milliseconds. Omit repeatMinutes for one-time work. Never put credentials or shell commands in an action.`
      : taskText.slice(0, 20_000)
    const moaEnabled = Boolean(getStore().get("moa.enabled"))
    const moaReferences = ((getStore().get("moa.referenceModels") as string[] | undefined) || []).filter(Boolean).slice(0, 8)
    const input = {
      prompt: agentPrompt, cwd,
      model: agent.model || getStore().get("defaults.model") as string | undefined,
      resume: agent.sessionId || undefined,
      resumeFallbackPrompt: fallbackContext ? `Continue this Telegram agent conversation using the context below. Preserve prior decisions and unfinished work.\n\n${fallbackContext}\n\nCurrent instruction:\n${agentPrompt}` : undefined,
      permissionMode: "auto" as const, noPlan: true,
      thinking: agent.thinking ?? ((getStore().get("defaults.thinking") as boolean | undefined) ?? true),
      selfVerify: Boolean(getStore().get("defaults.selfVerify")),
      maxTurns: (getStore().get("defaults.maxTurns") as number | undefined) || undefined,
      disableWebSearch: getStore().get("defaults.webSearch") === false,
      subagents: (getStore().get("agent.subagents") as boolean | undefined) ?? true,
      moa: moaEnabled && moaReferences.length >= 2 && telegramTaskNeedsMoa(taskText) ? {
        referenceModels: moaReferences,
        aggregatorModel: (getStore().get("moa.aggregatorModel") as string | undefined) || agent.model,
        referenceReasoningEffort: (getStore().get("moa.referenceEffort") as "low" | "medium" | "high" | undefined) || "medium",
        aggregatorReasoningEffort: (getStore().get("moa.aggregatorEffort") as "low" | "medium" | "high" | undefined) || "high",
        referenceTokenBudget: (getStore().get("moa.referenceTokenBudget") as number | undefined) || 600,
        context: fallbackContext || undefined,
      } : undefined,
    }
    telegramTaskReserved = true
    telegramTaskCancelled = false
    telegramRunningChat = chatId
    const run = startGrokRun(input)
    const startedAt = Date.now()
    const workspaceName = cwd === join(app.getPath("userData"), "Agent Workspace") ? "Agent (no project)" : getStore().get("projects").find((project) => project.path === cwd)?.name || "Scratch"
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
        else if (event.type === "end" && typeof event.sessionId === "string") saveTelegramSession(chatId, { sessionId: event.sessionId })
        else if (event.type === "thought") updateProgress("🧠 Grok Build is reasoning")
        else if (event.type.toLowerCase().includes("tool")) updateProgress("🔧 Grok Build is using workspace tools")
      })
      if (telegramTaskCancelled) {
        finishGrokRun(run.id, { status: "cancelled" })
        await telegram.editProgress(chatId, progressId, `⏹ Task cancelled\nTime: ${elapsed()}\nModel: ${modelName}`)
        return "Task cancelled."
      }
      finishGrokRun(run.id, { status: "completed" })
    } catch (error) {
      finishGrokRun(run.id, { status: "failed", error: error instanceof Error ? error.message : String(error) })
      await telegram.editProgress(chatId, progressId, `❌ Task failed\nTime: ${elapsed()}\nModel: ${modelName}`)
      throw error
    } finally {
      clearInterval(activityTimer)
      telegramRunningChat = ""
      telegramTaskReserved = false
      queueMicrotask(() => void processNextTelegramTask())
    }
    if (appControls) {
      for (const match of response.matchAll(/<app_action>(\{[^<]+\})<\/app_action>/g)) {
        try {
          const action = JSON.parse(match[1]) as { type?: string; name?: string; prompt?: string; runAt?: number; repeatMinutes?: number }
          if (action.type === "schedule.create" && action.name?.trim() && action.prompt?.trim() && Number.isFinite(action.runAt) && action.runAt! > Date.now()) {
            addSchedule({ name: action.name.slice(0, 120), prompt: action.prompt.slice(0, 20_000), cwd, model: input.model, runAt: action.runAt!, repeatMinutes: action.repeatMinutes && action.repeatMinutes >= 1 ? Math.min(action.repeatMinutes, 525_600) : undefined })
          }
        } catch { /* Invalid model actions never gain host authority. */ }
      }
    }
    const publicResponse = publicTelegramResponse(response) || "Task completed without a public text response."
    // The handler sends the actual answer immediately after returning. Remove
    // the transient progress card first so users never get a misleading
    // "Task finished" card without the model's response.
    await telegram.deleteProgress(chatId, progressId)
    const nextTranscript = [...transcript, { role: "user" as const, text: taskText.slice(0, 20_000) }, { role: "assistant" as const, text: publicResponse.slice(0, 20_000) }].slice(-12)
    saveTelegramSession(chatId, { transcript: nextTranscript, workspace: cwd, model: input.model, lastTask: taskText.slice(0, 20_000) })
    return publicResponse
  }
  const processNextTelegramTask = async (): Promise<void> => {
    if (backend.isRunning() || telegramTaskReserved) return
    const next = telegramQueue.shift()
    if (!next) return
    try {
      const reply = await handleTelegramAgentMessage(next.chatId, next.text)
      if (typeof reply === "string") await telegram.sendLong(next.chatId, reply)
      else await telegram.sendReply(next.chatId, reply)
    } catch (error) {
      await telegram.sendLong(next.chatId, `Queued task failed: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      if (telegramQueue.length) queueMicrotask(() => void processNextTelegramTask())
    }
  }
  telegram.setMessageHandler(handleTelegramAgentMessage)
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
