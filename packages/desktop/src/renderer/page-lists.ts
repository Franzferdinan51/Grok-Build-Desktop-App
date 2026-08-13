/**
 * Duck Agent list helpers for Skills and Scheduled pages:
 * scope grouping, search, and schedule status chips.
 */

export type SkillEntry = { name: string; description: string; path: string; scope: "project" | "user" | "compatible" }
export type SkillScope = SkillEntry["scope"]
export type SkillFilter = "all" | SkillScope

export function filterSkills(skills: SkillEntry[], query: string, scope: SkillFilter = "all"): SkillEntry[] {
  const needle = query.trim().toLowerCase()
  return skills
    .filter((skill) => scope === "all" || skill.scope === scope)
    .filter((skill) => !needle || `${skill.name} ${skill.description} ${skill.path} ${skill.scope}`.toLowerCase().includes(needle))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function skillScopeCounts(skills: SkillEntry[]): Record<SkillFilter, number> {
  return {
    all: skills.length,
    project: skills.filter((skill) => skill.scope === "project").length,
    user: skills.filter((skill) => skill.scope === "user").length,
    compatible: skills.filter((skill) => skill.scope === "compatible").length,
  }
}

export function groupSkills(skills: SkillEntry[]): { scope: SkillScope; items: SkillEntry[] }[] {
  const order: SkillScope[] = ["project", "user", "compatible"]
  return order
    .map((scope) => ({ scope, items: skills.filter((skill) => skill.scope === scope) }))
    .filter((group) => group.items.length > 0)
}

export type WorkflowEntry = { name: string; description: string; path: string; scope: "project" | "user" }
export type WorkflowFilter = "all" | WorkflowEntry["scope"]

export function filterWorkflows(workflows: WorkflowEntry[], query: string, scope: WorkflowFilter = "all"): WorkflowEntry[] {
  const needle = query.trim().toLowerCase()
  return workflows
    .filter((workflow) => scope === "all" || workflow.scope === scope)
    .filter((workflow) => !needle || `${workflow.name} ${workflow.description} ${workflow.path} ${workflow.scope}`.toLowerCase().includes(needle))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function workflowScopeCounts(workflows: WorkflowEntry[]): Record<WorkflowFilter, number> {
  return {
    all: workflows.length,
    project: workflows.filter((workflow) => workflow.scope === "project").length,
    user: workflows.filter((workflow) => workflow.scope === "user").length,
  }
}

export function groupWorkflows(workflows: WorkflowEntry[]): { scope: WorkflowEntry["scope"]; items: WorkflowEntry[] }[] {
  const order: WorkflowEntry["scope"][] = ["project", "user"]
  return order
    .map((scope) => ({ scope, items: workflows.filter((workflow) => workflow.scope === scope) }))
    .filter((group) => group.items.length > 0)
}

export type ScheduleEntry = {
  id: string
  name: string
  prompt: string
  cwd: string
  runAt: number
  enabled: boolean
  running?: boolean
  lastError?: string
  nextRunAt: number
  lastStatus?: "completed" | "failed"
  lastRunAt?: number
  repeatMinutes?: number
  model?: string
  lastRunId?: string
  lastThreadId?: string
}

export type ScheduleState = "active" | "paused" | "running" | "failed"

export function scheduleState(task: ScheduleEntry): ScheduleState {
  if (task.running) return "running"
  if (task.lastStatus === "failed") return "failed"
  return task.enabled ? "active" : "paused"
}

export function filterSchedules(tasks: ScheduleEntry[], query: string): ScheduleEntry[] {
  const needle = query.trim().toLowerCase()
  return tasks
    .filter((task) => !needle || `${task.name} ${task.prompt} ${task.cwd}`.toLowerCase().includes(needle))
    .sort((a, b) => a.nextRunAt - b.nextRunAt)
}

export function formatRepeat(minutes?: number): string {
  if (!minutes) return "Once"
  if (minutes % 1440 === 0) {
    const days = minutes / 1440
    return days === 1 ? "Daily" : `Every ${days} days`
  }
  if (minutes % 60 === 0) {
    const hours = minutes / 60
    return hours === 1 ? "Hourly" : `Every ${hours} hours`
  }
  return `Every ${minutes} min`
}

export function formatBytesLabel(value: unknown): string | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined
  if (value < 1024) return `${value}`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(0)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

export function objectRows(value: unknown): { key: string; value: string }[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return []
  return Object.entries(value as Record<string, unknown>).map(([key, entry]) => ({
    key,
    value: typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean"
      ? String(entry)
      : JSON.stringify(entry),
  }))
}
