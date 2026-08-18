import type { BackendEvent } from "../preload"

export type SubagentStatus = "running" | "completed" | "failed" | "cancelled"

export type SubagentActivity = {
  id: string
  label: string
  status: SubagentStatus
  startedAt: number
  finishedAt?: number
  durationMs?: number
  toolCalls?: number
  turns?: number
}

type SubagentPatch = Partial<Omit<SubagentActivity, "id">> & { id: string }

const MAX_VISIBLE_SUBAGENTS = 8
const TERMINAL_STATUSES = new Set<SubagentStatus>(["completed", "failed", "cancelled"])

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" ? value as Record<string, unknown> : {}
const text = (...values: unknown[]) => values.find((value): value is string => typeof value === "string" && Boolean(value.trim()))?.trim()
const number = (...values: unknown[]) => values.find((value): value is number => typeof value === "number" && Number.isFinite(value))

function statusOf(value: unknown): SubagentStatus | undefined {
  const normalized = typeof value === "string" ? value.toLowerCase() : ""
  if (normalized.includes("fail")) return "failed"
  if (normalized.includes("cancel")) return "cancelled"
  if (normalized.includes("complete") || normalized === "done" || normalized === "success") return "completed"
  if (normalized.includes("run") || normalized.includes("progress")) return "running"
  return undefined
}

function patchFromLifecycle(event: BackendEvent): SubagentPatch | null {
  const type = event.type.toLowerCase()
  const payload = record(event)
  const update = record(payload.update)
  const sessionUpdate = text(update.sessionUpdate, payload.sessionUpdate)?.toLowerCase()
  const lifecycle = type.replace(/_/g, ".")
  const started = lifecycle === "subagent.started" || lifecycle === "subagent.spawned" || sessionUpdate === "subagent_spawned"
  const finished = lifecycle === "subagent.completed" || lifecycle === "subagent.finished" || sessionUpdate === "subagent_finished"
  if (!started && !finished) return null
  const id = text(payload.id, payload.subagentId, payload.subagent_id, payload.childSessionId, payload.child_session_id, update.subagent_id, update.child_session_id)
  if (!id) return null
  const rawStatus = statusOf(text(payload.status, update.status))
  const status = started ? "running" : rawStatus || "completed"
  return {
    id,
    label: text(payload.label, payload.description, payload.title, update.description, update.title),
    status,
    startedAt: number(payload.startedAt, payload.started_at, update.startedAt, update.started_at) || Date.now(),
    finishedAt: finished ? Date.now() : undefined,
    durationMs: number(payload.durationMs, payload.duration_ms, update.durationMs, update.duration_ms),
    toolCalls: number(payload.toolCalls, payload.tool_calls, update.toolCalls, update.tool_calls),
    turns: number(payload.turns, update.turns),
  }
}

function patchFromHeadlessTool(event: BackendEvent): SubagentPatch | null {
  const payload = record(event)
  const rawInput = record(payload.rawInput || payload.raw_input)
  const toolName = text(payload.toolName, payload.tool_name, rawInput.toolName, rawInput.tool_name)?.toLowerCase()
  const id = text(payload.toolCallId, payload.tool_call_id, rawInput.subagentId, rawInput.subagent_id)
  if (!id || toolName !== "spawn_subagent" && toolName !== "task") return null
  return {
    id,
    label: text(rawInput.description, rawInput.prompt, payload.title) || "Native Grok Build subagent",
    status: "running",
    startedAt: Date.now(),
  }
}

function patchFromHeadlessCompletion(event: BackendEvent): SubagentPatch | null {
  const payload = record(event)
  const rawOutput = record(payload.rawOutput || payload.raw_output)
  const rawType = text(rawOutput.type, rawOutput.kind, rawOutput.event)?.toLowerCase() || ""
  const nested = record(rawOutput.SubagentCompleted || rawOutput.subagent_completed)
  const isSubagent = rawType.includes("subagent") || Object.keys(nested).length > 0
  if (!isSubagent) return null
  const id = text(payload.toolCallId, payload.tool_call_id, rawOutput.subagentId, rawOutput.subagent_id, nested.subagentId, nested.subagent_id)
  if (!id) return null
  const status = statusOf(text(rawOutput.status, nested.status)) || (text(rawOutput.error, nested.error) ? "failed" : "completed")
  return {
    id,
    status,
    finishedAt: Date.now(),
    durationMs: number(rawOutput.durationMs, rawOutput.duration_ms, nested.durationMs, nested.duration_ms),
    toolCalls: number(rawOutput.toolCalls, rawOutput.tool_calls, nested.toolCalls, nested.tool_calls),
    turns: number(rawOutput.turns, nested.turns),
  }
}

/** Convert verified Grok Build lifecycle/tool envelopes into a small renderer state patch. */
export function subagentPatchFromBackendEvent(event: BackendEvent): SubagentPatch | null {
  return patchFromLifecycle(event)
    || (event.type === "tool_call" ? patchFromHeadlessTool(event) : null)
    || (event.type === "tool_call_update" ? patchFromHeadlessCompletion(event) : null)
}

export function reduceSubagentActivities(current: SubagentActivity[], patch: SubagentPatch, now = Date.now()): SubagentActivity[] {
  const existing = current.find((entry) => entry.id === patch.id)
  const nextEntry: SubagentActivity = {
    id: patch.id,
    label: patch.label || existing?.label || "Native Grok Build subagent",
    status: patch.status || existing?.status || "running",
    startedAt: patch.startedAt || existing?.startedAt || now,
    finishedAt: patch.finishedAt || existing?.finishedAt,
    durationMs: patch.durationMs ?? existing?.durationMs,
    toolCalls: patch.toolCalls ?? existing?.toolCalls,
    turns: patch.turns ?? existing?.turns,
  }
  const without = current.filter((entry) => entry.id !== patch.id)
  const next = [nextEntry, ...without]
  return next.slice(0, MAX_VISIBLE_SUBAGENTS)
}

/** Keep the previous run visible while idle; reset only as a new run starts. */
export function shouldResetSubagentsForRunTransition(previousRunning: boolean, running: boolean): boolean {
  return !previousRunning && running
}

export function subagentStatusLabel(status: SubagentStatus): string {
  return status === "running" ? "working" : status
}

export function subagentDuration(activity: SubagentActivity, now = Date.now()): string {
  const duration = activity.durationMs ?? ((activity.finishedAt || now) - activity.startedAt)
  if (!Number.isFinite(duration) || duration < 0) return "—"
  return `${(duration / 1000).toFixed(1)}s`
}

export function hasRunningSubagents(activities: SubagentActivity[]): boolean {
  return activities.some((entry) => !TERMINAL_STATUSES.has(entry.status))
}
