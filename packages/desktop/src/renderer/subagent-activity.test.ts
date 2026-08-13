import assert from "node:assert/strict"
import test from "node:test"
import { reduceSubagentActivities, subagentPatchFromBackendEvent } from "./subagent-activity.ts"

test("normalizes official headless spawn and completion tool envelopes", () => {
  const started = subagentPatchFromBackendEvent({ type: "tool_call", toolCallId: "tool-1", toolName: "spawn_subagent", rawInput: { description: "Inspect tests" } })
  assert.deepEqual(started && { id: started.id, label: started.label, status: started.status }, { id: "tool-1", label: "Inspect tests", status: "running" })
  const completed = subagentPatchFromBackendEvent({ type: "tool_call_update", toolCallId: "tool-1", rawOutput: { type: "subagent_completed", duration_ms: 1250, turns: 2 } })
  assert.deepEqual(completed && { id: completed.id, status: completed.status, durationMs: completed.durationMs }, { id: "tool-1", status: "completed", durationMs: 1250 })
})

test("merges lifecycle updates without duplicating a subagent", () => {
  const started = subagentPatchFromBackendEvent({ type: "x.ai/session_notification", update: { sessionUpdate: "subagent_spawned", subagent_id: "sub-1", description: "Review" } })
  assert.ok(started)
  const running = reduceSubagentActivities([], started!, 100)
  const finished = subagentPatchFromBackendEvent({ type: "subagent_finished", subagent_id: "sub-1", duration_ms: 900 })
  assert.ok(finished)
  const done = reduceSubagentActivities(running, finished!, 1_000)
  assert.equal(done.length, 1)
  assert.equal(done[0]?.status, "completed")
  assert.equal(done[0]?.label, "Review")
})
