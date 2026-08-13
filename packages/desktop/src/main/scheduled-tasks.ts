import { randomUUID } from "crypto"
import { GrokBuildBackend } from "./grok-build-backend"
import { finishGrokRun, startGrokRun } from "./grok-runs"
import { recordGrokRunEvent } from "./grok-runs"
import { getStore, type ScheduledGrokTask } from "./store"
import { saveConversation, type StoredChatLog, type StoredChatThread } from "./conversation-store"
import { withRunNowPatch, withScheduleFinishPatch, withScheduleRunningPatch } from "./scheduled-tasks-utils"

export type ScheduledTaskEvent = { taskId: string; name: string; status: "running" | "completed" | "failed"; detail?: string; at: number; runId?: string; threadId?: string }
type ScheduleListener = (event: ScheduledTaskEvent) => void
const listeners = new Set<ScheduleListener>()
export function onScheduleEvent(listener: ScheduleListener): () => void { listeners.add(listener); return () => listeners.delete(listener) }
const boundedDetail = (detail?: string) => typeof detail === "string" ? detail.trim().slice(0, 2_000) || undefined : undefined
const MAX_SCHEDULED_LOG_CHARS = 2 * 1024 * 1024
const emitScheduleEvent = (event: ScheduledTaskEvent) => { const safe = { ...event, detail: boundedDetail(event.detail) }; for (const listener of listeners) listener(safe) }

export type NewSchedule = Pick<ScheduledGrokTask, "name" | "prompt" | "cwd" | "model" | "runAt" | "repeatMinutes">
export const listSchedules = () => getStore().get("schedules", []).sort((a, b) => a.nextRunAt - b.nextRunAt)

export function addSchedule(input: NewSchedule): ScheduledGrokTask {
  if (!input.name.trim() || !input.prompt.trim() || !input.cwd.trim()) throw new Error("Name, prompt, and workspace are required")
  const task: ScheduledGrokTask = { name: input.name.trim(), prompt: input.prompt.trim(), cwd: input.cwd.trim(), model: input.model?.trim() || undefined, runAt: input.runAt, repeatMinutes: input.repeatMinutes, id: randomUUID(), enabled: true, nextRunAt: input.runAt }
  getStore().set("schedules", [...listSchedules(), task]); return task
}
export function removeSchedule(id: string) { getStore().set("schedules", listSchedules().filter((task) => task.id !== id)) }
export function toggleSchedule(id: string, enabled: boolean) { getStore().set("schedules", listSchedules().map((task) => task.id === id ? { ...task, enabled } : task)) }
export function runScheduleNow(id: string, at: number = Date.now()) { getStore().set("schedules", listSchedules().map((task) => task.id === id ? withRunNowPatch(task, at) : task)) }

export class GrokTaskScheduler {
  private timer?: NodeJS.Timeout; private checking = false
  constructor(private backend: GrokBuildBackend) {}
  start() { this.clearStaleRunningTasks(); this.timer = setInterval(() => void this.tick(), 15_000); void this.tick() }
  stop() { if (this.timer) clearInterval(this.timer) }
  private clearStaleRunningTasks() {
    const tasks = listSchedules()
    if (!tasks.some((task) => task.running)) return
    const detail = "Interrupted when Grok Build Desktop restarted"
    for (const task of tasks) if (task.running && task.lastRunId) finishGrokRun(task.lastRunId, { status: "interrupted", error: detail })
    getStore().set("schedules", tasks.map((task) => task.running ? withScheduleRunningPatch(task, false, "Interrupted when Grok Build Desktop restarted") : task))
  }
  private async tick() {
    if (this.checking) return; this.checking = true
    try {
      const task = listSchedules().find((entry) => entry.enabled && entry.nextRunAt <= Date.now())
      if (!task) return
      if (this.backend.isRunning()) return
      const threadId = randomUUID()
      const startedAt = Date.now()
      const userMessage = { id: randomUUID(), role: "user" as const, logs: [{ kind: "text" as const, content: task.prompt }], createdAt: startedAt }
      const assistantMessage = { id: randomUUID(), role: "assistant" as const, logs: [] as StoredChatLog[], createdAt: startedAt }
      let thread: StoredChatThread = {
        id: threadId,
        workspace: task.cwd,
        title: `${task.name} · ${new Date(startedAt).toLocaleString()}`,
        createdAt: startedAt,
        updatedAt: startedAt,
        messages: [userMessage, assistantMessage],
        sessionId: "",
        model: task.model,
        sessionStatus: "new",
      }
      let reservedRunId: string
      try {
        reservedRunId = this.backend.reserveRun({ prompt: task.prompt, cwd: task.cwd, threadId })
      } catch {
        return
      }
      let saveChain = Promise.resolve()
      let writeTimer: NodeJS.Timeout | undefined
      let writePending = false
      const snapshotThread = () => ({ ...thread, updatedAt: Date.now(), messages: [{ ...userMessage }, { ...assistantMessage, logs: assistantMessage.logs.map((log) => ({ ...log })) }] })
      const flushThread = () => {
        writePending = false
        if (writeTimer) { clearTimeout(writeTimer); writeTimer = undefined }
        const snapshot = snapshotThread()
        saveChain = saveChain.then(() => saveConversation(snapshot).then(() => undefined))
        return saveChain
      }
      const persistThread = (immediate = false) => {
        writePending = true
        if (immediate) return flushThread()
        if (!writeTimer) writeTimer = setTimeout(() => {
          if (writePending) void flushThread().catch(() => undefined)
        }, 150)
        return saveChain
      }
      try { await persistThread(true) }
      catch (error) {
        const detail = `Could not persist scheduled conversation: ${String(error).slice(0, 2_000)}`
        this.backend.clearActiveRun(reservedRunId)
        this.finish(task, "failed", detail)
        emitScheduleEvent({ taskId: task.id, name: task.name, status: "failed", detail, at: Date.now() })
        return
      }
      let run: ReturnType<typeof startGrokRun> | undefined
      try {
        run = startGrokRun({ prompt: task.prompt, cwd: task.cwd, model: task.model, threadId }, reservedRunId)
        getStore().set("schedules", listSchedules().map((entry) => entry.id === task.id ? { ...withScheduleRunningPatch(entry, true), lastRunId: run!.id, lastThreadId: threadId } : entry))
        emitScheduleEvent({ taskId: task.id, name: task.name, status: "running", detail: "Grok Build is working in the scheduled workspace", at: Date.now(), runId: run.id, threadId })
        await this.backend.run({ prompt: task.prompt, cwd: task.cwd, model: task.model, threadId, permissionMode: "auto", noPlan: true }, (event) => {
          const sessionId = "sessionId" in event && typeof event.sessionId === "string" ? event.sessionId : undefined
          if (sessionId) { thread.sessionId = sessionId; thread.sessionStatus = "resumable"; persistThread() }
          recordGrokRunEvent(run!.id, {
            type: event.type,
            data: "data" in event && typeof event.data === "string" ? event.data : undefined,
            message: "message" in event && typeof event.message === "string" ? event.message : undefined,
            phase: "phase" in event && typeof event.phase === "string" ? event.phase : undefined,
            sessionId,
          })
          if (event.type === "text" || event.type === "thought") {
            const content = typeof event.data === "string" ? event.data : ""
            if (content) {
              assistantMessage.logs = [...assistantMessage.logs, { kind: event.type === "thought" ? "thought" : "text", content: content.slice(-MAX_SCHEDULED_LOG_CHARS) }]
              let total = assistantMessage.logs.reduce((sum, log) => sum + log.content.length, 0)
              while (total > MAX_SCHEDULED_LOG_CHARS && assistantMessage.logs.length > 1) {
                const removed = assistantMessage.logs.shift()
                total -= removed?.content.length || 0
              }
              persistThread()
            }
          } else if (event.type === "error" && typeof event.message === "string") {
            assistantMessage.logs = [...assistantMessage.logs, { kind: "error", content: event.message.slice(-2_000) }]
            persistThread()
          }
          if (event.type === "phase" && typeof event.data === "string" && event.data) emitScheduleEvent({ taskId: task.id, name: task.name, status: "running", detail: event.data, at: Date.now(), runId: run!.id, threadId })
        }, reservedRunId)
        if (!assistantMessage.logs.some((log) => log.kind === "text")) assistantMessage.logs = [{ kind: "text", content: "Scheduled task completed. Grok Build returned no public summary." }]
        await persistThread(true)
        finishGrokRun(run.id, { status: "completed", grokSessionId: thread.sessionId || undefined }); this.finish(task, "completed")
        emitScheduleEvent({ taskId: task.id, name: task.name, status: "completed", detail: "Scheduled task completed", at: Date.now(), runId: run.id, threadId })
      } catch (error) {
        const detail = String(error).slice(0, 2_000)
        if (!assistantMessage.logs.some((log) => log.kind === "error")) assistantMessage.logs = [...assistantMessage.logs, { kind: "error", content: detail }]
        try { await persistThread(true) } catch { /* retain the original task failure */ }
        if (run) finishGrokRun(run.id, { status: "failed", grokSessionId: thread.sessionId || undefined, error: detail })
        this.finish(task, "failed", detail)
        emitScheduleEvent({ taskId: task.id, name: task.name, status: "failed", detail, at: Date.now(), runId: run?.id, threadId })
      } finally {
        this.backend.clearActiveRun(run?.id || reservedRunId)
      }
    } finally { this.checking = false }
  }
  private finish(done: ScheduledGrokTask, status: "completed" | "failed", detail?: string) {
    const now = Date.now(); const repeat = done.repeatMinutes && done.repeatMinutes > 0
    getStore().set("schedules", listSchedules().map((task) => task.id === done.id ? withScheduleRunningPatch(withScheduleFinishPatch(task, status, now), false, detail) : task))
  }
}
