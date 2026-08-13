import test from "node:test"
import assert from "node:assert/strict"
import { MAX_CONSOLIDATED_REASONING_CHARS, publicChatLogs, splitThinking } from "./chat-utils.ts"

test("splitThinking combines separated reasoning phases into one collapsible block", () => {
  assert.deepEqual(splitThinking([
    { kind: "thought", content: "inspect" },
    { kind: "text", content: "Progress." },
    { kind: "thought", content: "verify" },
  ]), [
    { kind: "thought", content: "inspect\n\nverify" },
    { kind: "text", content: "Progress." },
  ])
})

test("splitThinking bounds a consolidated reasoning block", () => {
  const result = splitThinking([
    { kind: "thought", content: "a".repeat(MAX_CONSOLIDATED_REASONING_CHARS) },
    { kind: "text", content: "Done." },
    { kind: "thought", content: "b".repeat(2_000) },
  ])
  const thought = result.find((entry) => entry.kind === "thought")
  assert.ok(thought)
  assert.equal(thought.content.length, MAX_CONSOLIDATED_REASONING_CHARS)
  assert.match(thought.content, /reasoning condensed/)
})

test("publicChatLogs keeps the transcript to public output and errors", () => {
  assert.deepEqual(publicChatLogs([
    { kind: "thought", content: "inspect" },
    { kind: "text", content: "Implemented the fix." },
    { kind: "thought", content: "verify" },
    { kind: "error", content: "A later check needs attention." },
  ]), [
    { kind: "text", content: "Implemented the fix." },
    { kind: "error", content: "A later check needs attention." },
  ])
})
