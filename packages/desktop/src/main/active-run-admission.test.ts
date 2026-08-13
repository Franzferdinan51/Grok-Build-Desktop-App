import test from "node:test"
import assert from "node:assert/strict"
import { reserveActiveRun } from "./active-run-admission.ts"

test("active run admission is synchronous and singleton", () => {
  const input = { prompt: "inspect the workspace", cwd: "/tmp/workspace", threadId: "thread-1" }
  const run = reserveActiveRun(null, input, () => "run-1", 123)
  assert.deepEqual(run, { runId: "run-1", threadId: "thread-1", cwd: "/tmp/workspace", prompt: "inspect the workspace", startedAt: 123, events: [] })
  assert.throws(() => reserveActiveRun(run, input, () => "run-2"), /already running/)
})
