import type { GrokRunRecord } from "../preload"

export type RunMetrics = {
  runs: number
  inputTokens: number
  outputTokens: number
  measuredRuns: number
  averageLatencyMs?: number
  latestCostUsd?: number
}

export function summarizeRunMetrics(runs: GrokRunRecord[], limit = 20): RunMetrics {
  const recent = runs.slice(0, Math.max(0, limit))
  const measured = recent.filter((run) => typeof run.latencyMs === "number")
  const costs = recent.find((run) => typeof run.costUsd === "number")
  return {
    runs: recent.length,
    inputTokens: recent.reduce((total, run) => total + (run.tokensIn || 0), 0),
    outputTokens: recent.reduce((total, run) => total + (run.tokensOut || 0), 0),
    measuredRuns: measured.length,
    averageLatencyMs: measured.length ? measured.reduce((total, run) => total + (run.latencyMs || 0), 0) / measured.length : undefined,
    latestCostUsd: costs?.costUsd,
  }
}

export function compactTokenCount(value: number): string {
  if (value < 1_000) return String(value)
  if (value < 1_000_000) return `${(value / 1_000).toFixed(value < 10_000 ? 1 : 0)}k`
  return `${(value / 1_000_000).toFixed(value < 10_000_000 ? 1 : 0)}m`
}

export function compactLatency(value?: number): string {
  return value === undefined ? "not reported" : `${(value / 1_000).toFixed(1)}s avg`
}
