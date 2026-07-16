import { randomUUID } from "crypto"
import { GrokBuildBackend } from "./grok-build-backend"
import { finishGrokRun, startGrokRun } from "./grok-runs"
import { getStore, type ScheduledGrokTask } from "./store"

export type NewSchedule = Omit<ScheduledGrokTask, "id" | "enabled" | "nextRunAt" | "lastRunAt" | "lastStatus">
export const listSchedules = () => getStore().get("schedules", []).sort((a, b) => a.nextRunAt - b.nextRunAt)
export function addSchedule(input: NewSchedule): ScheduledGrokTask {
  if (!input.name.trim() || !input.prompt.trim() || !input.cwd.trim()) throw new Error("Name, prompt, and workspace are required")
  const task: ScheduledGrokTask = { ...input, id: randomUUID(), enabled: true, nextRunAt: input.runAt }
  getStore().set("schedules", [...listSchedules(), task]); return task
}
export function removeSchedule(id: string) { getStore().set("schedules", listSchedules().filter((task) => task.id !== id)) }
export function toggleSchedule(id: string, enabled: boolean) { getStore().set("schedules", listSchedules().map((task) => task.id === id ? { ...task, enabled } : task)) }
export function runScheduleNow(id: string) { getStore().set("schedules", listSchedules().map((task) => task.id === id ? { ...task, enabled: true, nextRunAt: Date.now() } : task)) }

export class GrokTaskScheduler {
  private timer?: NodeJS.Timeout; private checking = false
  constructor(private backend: GrokBuildBackend) {}
  start() { this.timer = setInterval(() => void this.tick(), 15_000); void this.tick() }
  stop() { if (this.timer) clearInterval(this.timer) }
  private async tick() {
    if (this.checking) return; this.checking = true
    try {
      const task = listSchedules().find((entry) => entry.enabled && entry.nextRunAt <= Date.now())
      if (!task) return
      if (this.backend.isRunning()) return
      const run = startGrokRun({ prompt: task.prompt, cwd: task.cwd, model: task.model })
      try {
        await this.backend.run({ prompt: task.prompt, cwd: task.cwd, model: task.model, permissionMode: "auto", noPlan: true }, () => {})
        finishGrokRun(run.id, { status: "completed" }); this.finish(task, "completed")
      } catch (error) {
        finishGrokRun(run.id, { status: "failed", error: String(error) }); this.finish(task, "failed")
      }
    } finally { this.checking = false }
  }
  private finish(done: ScheduledGrokTask, status: "completed" | "failed") {
    const now = Date.now(); const repeat = done.repeatMinutes && done.repeatMinutes > 0
    getStore().set("schedules", listSchedules().map((task) => task.id === done.id ? { ...task, lastRunAt: now, lastStatus: status, enabled: Boolean(repeat), nextRunAt: repeat ? now + done.repeatMinutes! * 60_000 : task.nextRunAt } : task))
  }
}
