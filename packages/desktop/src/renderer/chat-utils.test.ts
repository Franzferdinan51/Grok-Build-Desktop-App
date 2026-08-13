import test from "node:test"
import assert from "node:assert/strict"
import { splitThinking } from "./chat-utils.ts"

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
