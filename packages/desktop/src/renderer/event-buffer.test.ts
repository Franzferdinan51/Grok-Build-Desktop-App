import test from "node:test"
import assert from "node:assert/strict"
import { consolidateThoughts, LiveEventBuffer, MAX_CONSOLIDATED_THOUGHT_CHARS } from "./event-buffer.ts"

test("consolidateThoughts keeps reasoning in one record without reordering public output", () => {
  assert.deepEqual(consolidateThoughts([
    { kind: "thought", content: "inspect" },
    { kind: "text", content: "Found the issue." },
    { kind: "thought", content: "verify" },
    { kind: "error", content: "warning" },
  ]), [
    { kind: "thought", content: "inspect\n\nverify" },
    { kind: "text", content: "Found the issue." },
    { kind: "error", content: "warning" },
  ])
})

test("LiveEventBuffer remains bounded after reasoning consolidation", () => {
  const buffer = new LiveEventBuffer()
  buffer.append([
    { kind: "thought", content: "a".repeat(MAX_CONSOLIDATED_THOUGHT_CHARS) },
    { kind: "text", content: "Done." },
    { kind: "thought", content: "b".repeat(2_000) },
  ])
  const snapshot = buffer.snapshot()
  assert.equal(snapshot.filter((entry) => entry.kind === "thought").length, 1)
  assert.equal(snapshot.filter((entry) => entry.kind === "thought")[0]?.content.length, MAX_CONSOLIDATED_THOUGHT_CHARS)
})
