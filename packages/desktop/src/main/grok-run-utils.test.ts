import test from "node:test"
import assert from "node:assert/strict"
import { reconcileInterruptedRuns } from "./grok-run-utils.ts"
import type { GrokRunRecord } from "./store.ts"

const running: GrokRunRecord = {
  id: "run-1",
  threadId: "thread-1",
  cwd: "/workspace",
  prompt: "Fix the bug",
  startedAt: 1_000,
  status: "running",
  grokSessionId: "session-1",
}

test("orphaned running runs become explicitly interrupted", () => {
  const [recovered] = reconcileInterruptedRuns([running], 5_000)
  assert.equal(recovered?.status, "interrupted")
  assert.equal(recovered?.finishedAt, 5_000)
  assert.match(recovered?.error || "", /Outcome unknown/)
})

test("reconciliation is idempotent for terminal runs", () => {
  const interrupted = reconcileInterruptedRuns([running], 5_000)[0]!
  assert.deepEqual(reconcileInterruptedRuns([interrupted], 9_000), [interrupted])
})
