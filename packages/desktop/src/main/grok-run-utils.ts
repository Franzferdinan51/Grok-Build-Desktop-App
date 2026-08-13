import type { GrokRunRecord } from "./store"

export function reconcileInterruptedRuns(runs: GrokRunRecord[], finishedAt = Date.now()): GrokRunRecord[] {
  return runs.map((record) => record.status === "running" ? {
    ...record,
    status: "interrupted",
    finishedAt,
    error: "Outcome unknown: the app closed before this run finished. Review the workspace before resuming.",
  } : record)
}
