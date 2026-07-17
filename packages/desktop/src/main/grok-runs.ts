import { randomUUID } from "crypto"
import { getStore, type GrokRunRecord } from "./store"
import { reconcileInterruptedRuns } from "./grok-run-utils"

const MAX_RUNS = 100
const MAX_STORED_PROMPT = 8_000

export function recoverInterruptedGrokRuns(): void {
  const runs = listGrokRuns()
  if (runs.some((record) => record.status === "running")) getStore().set("runs", reconcileInterruptedRuns(runs))
}

export function listGrokRuns(): GrokRunRecord[] {
  return getStore().get("runs")
}

export function startGrokRun(input: { cwd: string; prompt: string; model?: string }): GrokRunRecord {
  const record: GrokRunRecord = {
    id: randomUUID(),
    cwd: input.cwd,
    prompt: input.prompt.length > MAX_STORED_PROMPT ? `${input.prompt.slice(0, MAX_STORED_PROMPT)}\n… [execution context omitted]` : input.prompt,
    model: input.model,
    startedAt: Date.now(),
    status: "running",
  }
  getStore().set("runs", [record, ...listGrokRuns()].slice(0, MAX_RUNS))
  return record
}

export function finishGrokRun(
  id: string,
  patch: Pick<GrokRunRecord, "status" | "grokSessionId" | "error">,
): GrokRunRecord | undefined {
  let updated: GrokRunRecord | undefined
  const runs = listGrokRuns().map((record) => {
    if (record.id !== id) return record
    updated = { ...record, ...patch, finishedAt: Date.now() }
    return updated
  })
  getStore().set("runs", runs)
  return updated
}
