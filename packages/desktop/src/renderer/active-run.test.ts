import test from "node:test"
import assert from "node:assert/strict"
import { activeRunLogs } from "./active-run.ts"

test("activeRunLogs restores only visible task output", () => {
  assert.deepEqual(activeRunLogs([
    { type: "phase", phase: "executing", data: "Working" },
    { type: "thought", data: "Inspecting files" },
    { type: "text", data: "Found the issue" },
    { type: "error", message: "Retrying" },
    { type: "end", usage: { output_tokens: 3 } },
  ]), [
    { kind: "activity", content: "Working" },
    { kind: "thought", content: "Inspecting files" },
    { kind: "text", content: "Found the issue" },
    { kind: "error", content: "Retrying" },
  ])
})
