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

export function startGrokRun(input: { cwd: string; prompt: string; model?: string; advisorCount?: number }): GrokRunRecord {
  const record: GrokRunRecord = {
    id: randomUUID(),
    cwd: input.cwd,
    prompt: input.prompt.length > MAX_STORED_PROMPT ? `${input.prompt.slice(0, MAX_STORED_PROMPT)}\n… [execution context omitted]` : input.prompt,
    model: input.model,
    startedAt: Date.now(),
    status: "running",
    advisorCount: input.advisorCount,
  }
  getStore().set("runs", [record, ...listGrokRuns()].slice(0, MAX_RUNS))
  return record
}

export function finishGrokRun(
  id: string,
  patch: Pick<GrokRunRecord, "status" | "grokSessionId" | "error"> & Partial<Pick<GrokRunRecord, "latencyMs" | "tokensIn" | "tokensOut" | "costUsd" | "advisorFailures" | "errorClass">>,
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

/** Grok versions/providers use slightly different usage field names. Keep the
 * raw protocol flexible, but only persist numeric values we can verify. */
export function usageMetrics(usage: unknown): Pick<GrokRunRecord, "tokensIn" | "tokensOut" | "costUsd"> {
  if (!usage || typeof usage !== "object") return {}
  const value = usage as Record<string, unknown>
  const number = (...keys: string[]) => {
    for (const key of keys) {
      const candidate = value[key]
      if (typeof candidate === "number" && Number.isFinite(candidate)) return candidate
    }
    return undefined
  }
  return {
    tokensIn: number("tokens_in", "input_tokens", "prompt_tokens", "inputTokens"),
    tokensOut: number("tokens_out", "output_tokens", "completion_tokens", "outputTokens"),
    costUsd: number("cost_usd", "costUsd", "total_cost_usd"),
  }
}

export function classifyRunError(message: string): string {
  if (/no output|timed? ?out|timeout/i.test(message)) return "timeout"
  if (/unauthorized|forbidden|auth/i.test(message)) return "authentication"
  if (/rate.?limit|429/i.test(message)) return "rate_limit"
  if (/network|connection|econn/i.test(message)) return "network"
  if (/cancel/i.test(message)) return "cancelled"
  return "runtime"
}
