/**
 * telegram/agent-handler.ts — Telegram agent dispatcher.
 *
 * Extracted from `main/index.ts` so the dispatcher can be unit-tested
 * without booting Electron + the Grok Build backend. Pure helpers in
 * `commands.ts` (parsing + menu construction) were always testable; the
 * stateful dispatcher was not because it leaned on module-scope
 * singletons (`telegramQueue`, `telegramRunningChat`, …).
 *
 * The factory below takes every collaborator as a parameter so the test
 * harness can swap them for stubs and exercise the queueing, idle-reset,
 * MoA auto-switch, and schedule.create flows without network or disk.
 */

import { mkdirSync } from "fs"
import { join } from "path"
import { app } from "electron"
import { publicTelegramResponse } from "../telegram-output"
import { parseTelegramCommand, parseTelegramCallback, buildTelegramMenuReply, buildTelegramModelPicker, mapMenuCallback, TELEGRAM_HELP_TEXT } from "./commands"
import { addSchedule, listSchedules } from "../scheduled-tasks"
import { finishGrokRun, startGrokRun } from "../grok-runs"
import { validateAppActions } from "../app-actions"
import { write as writeLog } from "../logging"
import { getStore } from "../store"
import type { TelegramBridge } from "../telegram"
import type { GrokBuildBackend, RunTaskInput, GrokBuildEvent } from "../grok-build-backend"

export type TelegramQueueEntry = { chatId: string; text: string; queuedAt: number }
export type TelegramAgentSession = {
  sessionId?: string; model?: string; workspace?: string; updatedAt: number
  transcript?: { role: "user" | "assistant"; text: string }[]
  lastTask?: string; compressedSummary?: string; thinking?: boolean; mode?: "fast" | "balanced" | "deep"
}

export type AgentHandlerDeps = {
  backend: GrokBuildBackend
  telegram: TelegramBridge
  /** Mutable queues/state — owned by the dispatcher, not the bridge. */
  queue: TelegramQueueEntry[]
  getReserved(): boolean
  setReserved(value: boolean): void
  getCancelled(): boolean
  setCancelled(value: boolean): void
  getRunningChat(): string
  setRunningChat(chatId: string): void
  session(chatId: string): TelegramAgentSession
  saveSession(chatId: string, patch: Partial<TelegramAgentSession>): TelegramAgentSession
  /** Run the next queued task after the current one finishes. */
  scheduleNextTask(): void
  /** Build the input Grok Build expects when invoking the agent. */
  buildInput(chatId: string, taskText: string, agent: TelegramAgentSession): Promise<RunTaskInput | undefined>
}

const telegramSession = (chatId: string, store = getStore()): TelegramAgentSession => store.get("telegram").sessions?.[chatId] || { updatedAt: Date.now() }
const saveTelegramSession = (chatId: string, patch: Partial<TelegramAgentSession>, store = getStore()): TelegramAgentSession => {
  const telegramSettings = store.get("telegram")
  const next = { ...telegramSession(chatId, store), ...patch, updatedAt: Date.now() }
  store.set("telegram", { ...telegramSettings, sessions: { ...telegramSettings.sessions, [chatId]: next } })
  return next
}

export function createAgentHandler(deps: AgentHandlerDeps) {
  const { backend, queue } = deps

  const handleMessage = async (chatId: string, text: string): Promise<string | { text: string; buttons: { text: string; data: string }[][] }> => {
    // Picker callbacks: each prefix is routed through the shipped
    // parseTelegramCallback so the dispatcher table can stay in one place.
    const callback = parseTelegramCallback(text)
    if (callback) {
      if (callback.kind === "pick_model") {
        const index = Number(callback.payload)
        const catalog = await backend.models(); const selected = catalog.models[index]
        if (!selected) return "That model is no longer available. Open /models again."
        deps.saveSession(chatId, { model: selected }); return `✓ Model set to ${selected}`
      }
      if (callback.kind === "pick_project_index") {
        const index = Number(callback.payload)
        const projects = getStore().get("projects") as Array<{ id: string; name: string; path: string }>
        const selected = projects[index]
        if (!selected) return "That project is no longer available. Open /projects again."
        deps.saveSession(chatId, { workspace: selected.path, sessionId: "", transcript: [], compressedSummary: "", lastTask: undefined }); return `✓ Project set to ${selected.name}\n${selected.path}\nStarted a fresh project session.`
      }
      if (callback.kind === "pick_project_id") {
        const projects = getStore().get("projects") as Array<{ id: string; name: string; path: string }>
        const selected = projects.find((project) => project.id === callback.payload)
        if (!selected) return "That project is no longer available. Open /project again."
        deps.saveSession(chatId, { workspace: selected.path, sessionId: "", transcript: [], compressedSummary: "", lastTask: undefined }); return `✓ Project set to ${selected.name}\n${selected.path}\nStarted a fresh project session.`
      }
      if (callback.kind === "pick_project_scratch") {
        const scratch = join(app.getPath("userData"), "Scratch")
        mkdirSync(scratch, { recursive: true }); deps.saveSession(chatId, { workspace: scratch, sessionId: "", transcript: [], compressedSummary: "", lastTask: undefined })
        return `✓ Project set to Scratch\n${scratch}\nStarted a fresh project session.`
      }
      if (callback.kind === "pick_project_agent") {
        const workspace = join(app.getPath("userData"), "Agent Workspace")
        mkdirSync(workspace, { recursive: true }); deps.saveSession(chatId, { workspace, sessionId: "", transcript: [], compressedSummary: "", lastTask: undefined })
        return `✓ Agent mode enabled\nWorking directory: ${workspace}\nThis is a persistent general-purpose workspace and is not tied to any project.`
      }
      if (callback.kind === "pick_mode") {
        const mode = callback.payload as "fast" | "balanced" | "deep"
        deps.saveSession(chatId, { mode })
        return `⚡ Response mode set to ${mode}.`
      }
      if (callback.kind === "menu") {
        const rewritten = mapMenuCallback(callback.payload)
        if (rewritten) return handleMessage(chatId, rewritten)
      }
    }
    const parsed = parseTelegramCommand(text)
    const name = parsed?.name
    const argument = parsed?.argument || ""
    const menu = buildTelegramMenuReply()
    if (name === "start" || name === "help" || name === "menu") return menu
    if (name === "new" || name === "reset") {
      deps.saveSession(chatId, { sessionId: "", transcript: [], compressedSummary: "", lastTask: undefined })
      return "✨ Fresh agent session started. Your selected model and project are unchanged."
    }
    if (name === "queue") {
      const queued = queue.filter((entry) => entry.chatId === chatId)
      if (!queued.length) return backend.isRunning() ? "No additional work queued. One task is currently running." : "The agent queue is empty."
      return `Queued work (${queued.length}):\n${queued.map((entry, index) => `${index + 1}. ${entry.text.slice(0, 120)}`).join("\n")}`
    }
    if (name === "history") {
      const transcript = deps.session(chatId).transcript || []
      if (!transcript.length) return "This agent session has no visible conversation history yet."
      return transcript.slice(-8).map((entry) => `${entry.role === "user" ? "You" : "Agent"}: ${entry.text.slice(0, 700)}`).join("\n\n")
    }
    if (name === "undo") {
      const agent = deps.session(chatId)
      const transcript = agent.transcript || []
      if (transcript.length < 2) return "There is no completed turn to undo."
      deps.saveSession(chatId, { transcript: transcript.slice(0, -2), sessionId: "", lastTask: undefined })
      return "↩️ Previous turn removed. The next message will continue from the restored visible context."
    }
    if (name === "compress") {
      const agent = deps.session(chatId)
      const transcript = agent.transcript || []
      if (transcript.length < 4) return "The session is already compact."
      const summary = transcript.slice(0, -4).map((entry) => `${entry.role === "user" ? "User" : "Agent"}: ${entry.text.slice(0, 900)}`).join("\n").slice(-8_000)
      deps.saveSession(chatId, { compressedSummary: summary, transcript: transcript.slice(-4), sessionId: "" })
      return `🗜️ Context checkpointed. Kept the latest ${Math.min(2, transcript.length / 2)} turns active and preserved earlier decisions in a bounded recovery summary.`
    }
    if (name === "reasoning") {
      const normalized = argument.toLowerCase()
      if (!normalized) return `Session reasoning: ${(deps.session(chatId).thinking ?? ((getStore().get("defaults.thinking") as boolean | undefined) ?? true)) ? "on" : "off"}\nUse /reasoning on or /reasoning off.`
      if (!["on", "off", "high", "low"].includes(normalized)) return "Usage: /reasoning on|off"
      const enabled = normalized === "on" || normalized === "high"
      deps.saveSession(chatId, { thinking: enabled })
      return `🧠 Session reasoning ${enabled ? "enabled" : "disabled"}.`
    }
    if (name === "mode") {
      const normalized = argument.toLowerCase() as "fast" | "balanced" | "deep"
      const current = deps.session(chatId).mode || "balanced"
      if (!argument) return `Response mode: ${current}\nFast uses the direct model, balanced uses a short advisor deadline for substantial work, and deep runs the full configured MoA.\nUse /mode fast, /mode balanced, or /mode deep.`
      if (!["fast", "balanced", "deep"].includes(normalized)) return "Usage: /mode fast|balanced|deep"
      deps.saveSession(chatId, { mode: normalized })
      return `⚡ Response mode set to ${normalized}.`
    }
    if (name === "retry") {
      const agent = deps.session(chatId)
      if (!agent.lastTask) return "There is no previous instruction to retry."
      const transcript = agent.transcript || []
      deps.saveSession(chatId, { transcript: transcript.slice(0, -2), sessionId: "" })
      return handleMessage(chatId, agent.lastTask)
    }
    if (name === "schedules") {
      const schedules = listSchedules().filter((task: { enabled: boolean }) => task.enabled).slice(0, 20)
      if (!schedules.length) return "No scheduled agent work is enabled."
      return `Scheduled work:\n${schedules.map((task: { name: string; nextRunAt: number }, index: number) => `${index + 1}. ${task.name} — ${new Date(task.nextRunAt).toLocaleString()}`).join("\n")}`
    }
    if (name === "steer" || name === "interrupt") {
      if (!argument) return `Usage: /${name} <instruction>`
      if (name === "interrupt" && deps.getRunningChat() === chatId) { deps.setCancelled(true); backend.cancel() }
      queue.unshift({ chatId, text: argument.slice(0, 20_000), queuedAt: Date.now() })
      deps.scheduleNextTask()
      return name === "interrupt" ? "⏭ Interrupting current work; your instruction is next." : "↪️ Instruction prioritized for the next agent turn."
    }
    if (name === "cancel" || name === "stop") {
      const wasRunning = deps.getRunningChat() === chatId
      if (wasRunning) deps.setCancelled(true)
      if (wasRunning) backend.cancel()
      return wasRunning ? "Stopping this chat’s active Grok Build task…" : "This chat does not own the active task."
    }
    if (name === "restart") {
      if (deps.getRunningChat() && deps.getRunningChat() !== chatId) return "Another chat owns the active task. Stop it there before restarting the agent."
      if (deps.getRunningChat() === chatId) { deps.setCancelled(true); backend.cancel() }
      setTimeout(() => {
        writeLog("info", `Telegram-authorized agent restart requested by chat ${chatId}`)
        app.relaunch()
        app.exit(0)
      }, 2_000).unref()
      return "🔄 Restarting Grok Build Desktop and its Telegram agent. I’ll resume polling automatically when it is back."
    }
    if (name === "workspace") return `Active working directory: ${deps.session(chatId).workspace || (getStore().get("workspace.last") as string | undefined) || "Scratch"}`
    if (name === "status" || name === "health") {
      const status = await backend.status()
      const catalog = await backend.models()
      const agent = deps.session(chatId)
      const model = agent.model || (getStore().get("defaults.model") as string | undefined) || catalog.defaultModel || "Grok Build default"
      const workspacePath = agent.workspace || (getStore().get("workspace.last") as string | undefined) || join(app.getPath("userData"), "Scratch")
      const projects = getStore().get("projects") as Array<{ id: string; name: string; path: string }>
      const workspace = workspacePath === join(app.getPath("userData"), "Agent Workspace") ? "Agent (no project)" : projects.find((project) => project.path === workspacePath)?.name || "Scratch"
      const moaOn = Boolean(getStore().get("moa.enabled"))
      const moaAggregator = (getStore().get("moa.aggregatorModel") as string | undefined) || model
      const mode = agent.mode || "balanced"
      const moaLine = moaOn ? `\nMode: ${mode}\nMoA: ${mode === "fast" ? "Bypassed for fastest replies" : mode === "deep" ? `Full configured advisors → ${moaAggregator}` : `Adaptive, short advisor deadline → ${moaAggregator}`}` : "\nMoA: Off"
      if (!status.available) return `🔴 Grok Build unavailable\n${status.error}`
      return `🟢 Grok Build agent ready\n\nStatus: ${backend.isRunning() ? `Task running${deps.getRunningChat() === chatId ? " in this chat" : ""}` : "Idle"}\nSession: ${agent.sessionId ? "Resumable" : "Fresh"}\nDirect model: ${model}${moaLine}\nProject: ${workspace}\nBackend: ${status.version || "available"}\nModels: ${catalog.models.length}\n\nUse /new to reset, or /models and /project to change context.`
    }
    if (name === "models") {
      const catalog = await backend.models()
      const current = deps.session(chatId).model || (getStore().get("defaults.model") as string | undefined) || catalog.defaultModel || "Grok Build default"
      return buildTelegramModelPicker(catalog.models, current)
    }
    if (name === "model") {
      if (!argument) return "Usage: /model <name>\nUse /models to see available models."
      const catalog = await backend.models()
      if (!catalog.models.includes(argument)) return `Unknown model: ${argument}\nUse /models to see available models.`
      deps.saveSession(chatId, { model: argument })
      return `Default model set to ${argument}.`
    }
    if (name === "projects" || name === "project") {
      const projects = getStore().get("projects") as Array<{ id: string; name: string; path: string }>
      const current = deps.session(chatId).workspace || getStore().get("workspace.last") as string | undefined
      const scratch = join(app.getPath("userData"), "Scratch")
      const agentWorkspace = join(app.getPath("userData"), "Agent Workspace")
      return { text: "Choose where the agent works. Agent mode is persistent and does not require a project:", buttons: [
        [{ text: `${current === agentWorkspace ? "✓ " : ""}🤖 Agent (no project)`, data: "pick_project_agent" }],
        [{ text: `${current === scratch ? "✓ " : ""}Scratch`, data: "pick_project_scratch" }],
        ...projects.slice(0, 30).map((project) => [{ text: `${project.path === current ? "✓ " : ""}${project.name}`.slice(0, 60), data: `pick_project_id:${project.id}` }]),
      ] }
    }
    if (name && name !== "run") return `Unknown command /${name}.\n\n${TELEGRAM_HELP_TEXT}`
    const taskText = name === "run" ? argument : text
    if (!taskText) return "Usage: /run <task>"
    if (backend.isRunning() || deps.getReserved()) {
      queue.push({ chatId, text: taskText.slice(0, 20_000), queuedAt: Date.now() })
      return `📥 Task queued at position ${queue.length}. Use /queue to inspect it, /steer to prioritize work, or /interrupt to stop the active turn.`
    }
    let agent = deps.session(chatId)
    const idleHours = Math.max(0, Number(getStore().get("agent.sessionIdleHours")) || 0)
    if (idleHours > 0 && Date.now() - agent.updatedAt > idleHours * 60 * 60_000) {
      deps.saveSession(chatId, { sessionId: "", transcript: [], compressedSummary: "" })
      agent = deps.session(chatId)
    }
    return await runAgentTask(deps, chatId, taskText, agent)
  }

  return { handleMessage }
}

async function runAgentTask(deps: AgentHandlerDeps, chatId: string, taskText: string, agent: TelegramAgentSession): Promise<string> {
  const { backend, telegram } = deps
  const input = await deps.buildInput(chatId, taskText, agent)
  if (!input) return "Agent task could not be built — no project / model configured."
  deps.setReserved(true)
  deps.setCancelled(false)
  deps.setRunningChat(chatId)
  const run = startGrokRun(input)
  const startedAt = Date.now()
  const cwd = input.cwd || agent.workspace || join(app.getPath("userData"), "Scratch")
  const workspaceName = cwd === join(app.getPath("userData"), "Agent Workspace") ? "Agent (no project)" : getStore().get("projects").find((project) => project.path === cwd)?.name || "Scratch"
  const modelName = input.model || "Grok Build default"
  await telegram.sendActivity(chatId)
  const progressId = await telegram.sendProgress(chatId, `🚀 Task started\nModel: ${modelName}\nWorkspace: ${workspaceName}`)
  let response = ""
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
    await backend.run(input, (event: GrokBuildEvent) => {
      if (event.type === "text" && typeof event.data === "string") { response += event.data; updateProgress("✍️ Grok Build is preparing the response") }
      else if (event.type === "end" && typeof event.sessionId === "string") deps.saveSession(chatId, { sessionId: event.sessionId })
      else if (event.type === "thought") updateProgress("🧠 Grok Build is reasoning")
      else if (event.type.toLowerCase().includes("tool")) updateProgress("🔧 Grok Build is using workspace tools")
    })
    if (deps.getCancelled()) {
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
    deps.setRunningChat("")
    deps.setReserved(false)
    deps.scheduleNextTask()
  }
  if (getStore().get("agent.appControls")) {
    const { actions } = validateAppActions(response)
    for (const action of actions) {
      if (action.type === "schedule.create") {
        addSchedule({ name: action.name, prompt: action.prompt, cwd, model: input.model, runAt: action.runAt, repeatMinutes: action.repeatMinutes })
      }
    }
  }
  const publicResponse = publicTelegramResponse(response) || "Task completed without a public text response."
  await telegram.deleteProgress(chatId, progressId)
  const transcript = agent.transcript || []
  const nextTranscript = [...transcript, { role: "user" as const, text: taskText.slice(0, 20_000) }, { role: "assistant" as const, text: publicResponse.slice(0, 20_000) }].slice(-12)
  deps.saveSession(chatId, { transcript: nextTranscript, workspace: cwd, model: input.model, lastTask: taskText.slice(0, 20_000) })
  return publicResponse
}

export { telegramSession as defaultAgentSession, saveTelegramSession as saveAgentSession }
