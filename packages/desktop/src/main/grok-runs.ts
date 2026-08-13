import { randomUUID } from "crypto"
import { getStore, type GrokRunJournalEvent, type GrokRunRecord } from "./store"
import { classifyBackendError } from "./backend-error"
import { reconcileInterruptedRuns } from "./grok-run-utils"

const MAX_RUNS = 100
const MAX_STORED_PROMPT = 8_000
const MAX_JOURNAL_EVENTS = 120
const MAX_JOURNAL_EVENT_CHARS = 32_000

export function recoverInterruptedGrokRuns(): void {
  const runs = listGrokRuns()
  const journal = getStore().get("activeRunJournal")
  const recovered = reconcileInterruptedRuns(runs).map((record) => {
    if (record.status !== "interrupted" || !journal || journal.runId !== record.id) return record
    return {
      ...record,
      threadId: record.threadId || journal.threadId,
      cwd: record.cwd || journal.cwd,
      prompt: record.prompt || journal.prompt,
      model: record.model || journal.model,
      grokSessionId: record.grokSessionId || journal.sessionId,
      eventTail: journal.events,
    }
  })
  if (runs.some((record) => record.status === "running") || journal) {
    getStore().set("runs", recovered)
    getStore().delete("activeRunJournal")
  }
}

export function listGrokRuns(): GrokRunRecord[] {
  return getStore().get("runs")
}

export function startGrokRun(input: { cwd: string; prompt: string; model?: string; threadId?: string; advisorCount?: number }): GrokRunRecord {
  const record: GrokRunRecord = {
    id: randomUUID(),
    threadId: input.threadId,
    cwd: input.cwd,
    prompt: input.prompt.length > MAX_STORED_PROMPT ? `${input.prompt.slice(0, MAX_STORED_PROMPT)}\n… [execution context omitted]` : input.prompt,
    model: input.model,
    startedAt: Date.now(),
    status: "running",
    advisorCount: input.advisorCount,
  }
  getStore().set("runs", [record, ...listGrokRuns()].slice(0, MAX_RUNS))
  getStore().set("activeRunJournal", {
    runId: record.id,
    threadId: record.threadId,
    cwd: record.cwd,
    prompt: record.prompt,
    model: record.model,
    startedAt: record.startedAt,
    lastEventAt: record.startedAt,
    events: [],
  })
  return record
}

export function recordGrokRunEvent(runId: string, event: GrokRunJournalEvent): void {
  const journal = getStore().get("activeRunJournal")
  if (!journal || journal.runId !== runId) return
  const bounded = (value?: string) => value?.slice(-MAX_JOURNAL_EVENT_CHARS)
  const nextEvent: GrokRunJournalEvent = {
    type: event.type,
    data: bounded(event.data),
    message: bounded(event.message),
    phase: bounded(event.phase),
    sessionId: bounded(event.sessionId),
  }
  getStore().set("activeRunJournal", {
    ...journal,
    lastEventAt: Date.now(),
    phase: nextEvent.phase || journal.phase,
    sessionId: nextEvent.sessionId || journal.sessionId,
    events: [...journal.events, nextEvent].slice(-MAX_JOURNAL_EVENTS),
  })
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
  const journal = getStore().get("activeRunJournal")
  if (journal?.runId === id) getStore().delete("activeRunJournal")
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
  return classifyBackendError(message).class
}
