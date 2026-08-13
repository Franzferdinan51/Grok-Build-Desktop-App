export type RunPhase = "starting" | "advising" | "executing" | "recovering" | "completed" | "failed" | "cancelled"

export type RunActivity = { phase: RunPhase; label: string; detail?: string; at: number }

const labels: Record<RunPhase, string> = {
  starting: "Preparing task",
  advising: "Reviewing with advisors",
  executing: "Grok Build is working",
  recovering: "Recovering task",
  completed: "Task completed",
  failed: "Task needs attention",
  cancelled: "Task cancelled",
}

export function normalizeRunPhase(value: unknown): RunPhase | null {
  return typeof value === "string" && value in labels ? value as RunPhase : null
}

export function runActivityFor(phase: RunPhase, detail?: string, at = Date.now()): RunActivity {
  return { phase, label: labels[phase], detail: detail?.trim() || undefined, at }
}

export function activityTone(phase: RunPhase): "active" | "success" | "error" | "neutral" {
  if (phase === "completed") return "success"
  if (phase === "failed") return "error"
  if (phase === "cancelled") return "neutral"
  return "active"
}
