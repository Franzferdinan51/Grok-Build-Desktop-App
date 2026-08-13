import test from "node:test"
import assert from "node:assert/strict"
import { buildActivityTimeline } from "./activity-timeline.ts"

test("buildActivityTimeline groups consecutive duplicate activity and keeps order", () => {
  const entries = buildActivityTimeline([
    { kind: "thought", content: "Inspecting files" },
    { kind: "thought", content: "Inspecting files" },
    { kind: "text", content: "I found the issue." },
    { kind: "error", content: "The first attempt failed." },
  ])
  assert.deepEqual(entries.map((entry) => [entry.kind, entry.label, entry.count]), [
    ["reasoning", "Reasoning", 2],
    ["response", "Response", 1],
    ["error", "Error", 1],
  ])
})

test("buildActivityTimeline ignores blank entries and bounds the tail", () => {
  const entries = buildActivityTimeline([
    { kind: "text", content: " " },
    { kind: "text", content: "one" },
    { kind: "text", content: "two" },
    { kind: "text", content: "three" },
  ], 2)
  assert.deepEqual(entries.map((entry) => entry.detail), ["two", "three"])
})
