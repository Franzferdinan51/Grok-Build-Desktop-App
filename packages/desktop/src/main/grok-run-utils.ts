import type { GrokRunRecord } from "./store"

export function reconcileInterruptedRuns(runs: GrokRunRecord[], finishedAt = Date.now()): GrokRunRecord[] {
  return runs.map((record) => record.status === "running" ? {
    ...record,
    status: "cancelled",
    finishedAt,
    error: "Interrupted because the app closed before this run finished.",
  } : record)
}
