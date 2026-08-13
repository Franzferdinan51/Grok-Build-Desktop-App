import { randomUUID } from "crypto"
import { GrokBuildBackend } from "./grok-build-backend"
import { finishGrokRun, startGrokRun } from "./grok-runs"
import { getStore, type ScheduledGrokTask } from "./store"
import { withRunNowPatch, withScheduleFinishPatch, withScheduleRunningPatch } from "./scheduled-tasks-utils"

export type ScheduledTaskEvent = { taskId: string; name: string; status: "running" | "completed" | "failed"; detail?: string; at: number; runId?: string }
type ScheduleListener = (event: ScheduledTaskEvent) => void
const listeners = new Set<ScheduleListener>()
export function onScheduleEvent(listener: ScheduleListener): () => void { listeners.add(listener); return () => listeners.delete(listener) }
const boundedDetail = (detail?: string) => typeof detail === "string" ? detail.trim().slice(0, 2_000) || undefined : undefined
const emitScheduleEvent = (event: ScheduledTaskEvent) => { const safe = { ...event, detail: boundedDetail(event.detail) }; for (const listener of listeners) listener(safe) }

export type NewSchedule = Omit<ScheduledGrokTask, "id" | "enabled" | "nextRunAt" | "lastRunAt" | "lastStatus">
export const listSchedules = () => getStore().get("schedules", []).sort((a, b) => a.nextRunAt - b.nextRunAt)

export function addSchedule(input: NewSchedule): ScheduledGrokTask {
  if (!input.name.trim() || !input.prompt.trim() || !input.cwd.trim()) throw new Error("Name, prompt, and workspace are required")
  const task: ScheduledGrokTask = { ...input, id: randomUUID(), enabled: true, nextRunAt: input.runAt }
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
    getStore().set("schedules", tasks.map((task) => task.running ? withScheduleRunningPatch(task, false, "Interrupted when Grok Build Desktop restarted") : task))
  }
  private async tick() {
    if (this.checking) return; this.checking = true
    try {
      const task = listSchedules().find((entry) => entry.enabled && entry.nextRunAt <= Date.now())
      if (!task) return
      if (this.backend.isRunning()) return
      const run = startGrokRun({ prompt: task.prompt, cwd: task.cwd, model: task.model })
      getStore().set("schedules", listSchedules().map((entry) => entry.id === task.id ? withScheduleRunningPatch(entry, true) : entry))
      emitScheduleEvent({ taskId: task.id, name: task.name, status: "running", detail: "Grok Build is working in the scheduled workspace", at: Date.now(), runId: run.id })
      try {
        await this.backend.run({ prompt: task.prompt, cwd: task.cwd, model: task.model, permissionMode: "auto", noPlan: true }, (event) => {
          if (event.type === "phase" && typeof event.data === "string" && event.data) emitScheduleEvent({ taskId: task.id, name: task.name, status: "running", detail: event.data, at: Date.now(), runId: run.id })
        })
        finishGrokRun(run.id, { status: "completed" }); this.finish(task, "completed")
        emitScheduleEvent({ taskId: task.id, name: task.name, status: "completed", detail: "Scheduled task completed", at: Date.now(), runId: run.id })
      } catch (error) {
        const detail = String(error).slice(0, 2_000)
        finishGrokRun(run.id, { status: "failed", error: detail }); this.finish(task, "failed", detail)
        emitScheduleEvent({ taskId: task.id, name: task.name, status: "failed", detail, at: Date.now(), runId: run.id })
      }
    } finally { this.checking = false }
  }
  private finish(done: ScheduledGrokTask, status: "completed" | "failed", detail?: string) {
    const now = Date.now(); const repeat = done.repeatMinutes && done.repeatMinutes > 0
    getStore().set("schedules", listSchedules().map((task) => task.id === done.id ? withScheduleRunningPatch(withScheduleFinishPatch(task, status, now), false, detail) : task))
  }
}
