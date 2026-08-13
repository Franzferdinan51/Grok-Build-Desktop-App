import assert from "node:assert/strict"
import test from "node:test"
import { compactLatency, compactTokenCount, summarizeRunMetrics } from "./run-metrics.ts"

test("summarizeRunMetrics keeps token totals and measured latency bounded to recent runs", () => {
  const summary = summarizeRunMetrics([
    { id: "new", cwd: "/tmp", prompt: "new", startedAt: 0, status: "completed", latencyMs: 2_000, tokensIn: 1_200, tokensOut: 400, costUsd: 0.02 },
    { id: "old", cwd: "/tmp", prompt: "old", startedAt: 0, status: "completed", latencyMs: 4_000, tokensIn: 900, tokensOut: 100 },
  ], 1)
  assert.deepEqual(summary, { runs: 1, inputTokens: 1_200, outputTokens: 400, measuredRuns: 1, averageLatencyMs: 2_000, latestCostUsd: 0.02 })
})

test("compact diagnostics stay readable", () => {
  assert.equal(compactTokenCount(900), "900")
  assert.equal(compactTokenCount(12_000), "12k")
  assert.equal(compactTokenCount(1_200_000), "1.2m")
  assert.equal(compactLatency(2_500), "2.5s avg")
  assert.equal(compactLatency(), "not reported")
})
