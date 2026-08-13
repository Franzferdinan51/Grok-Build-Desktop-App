import assert from "node:assert/strict"
import test from "node:test"
import { checkpointFor, DEFAULT_VISIBLE_CONTEXT_BUDGET, visibleConversationContext } from "./chat-context.ts"

const message = (role: "user" | "assistant", content: string) => ({ role, logs: [{ kind: "text" as const, content }] })

test("visibleConversationContext uses a bounded default and reserves space for the checkpoint", () => {
  const items = Array.from({ length: 8 }, (_, index) => message(index % 2 ? "assistant" : "user", `turn-${index} ${"x".repeat(2_000)}`))
  const summary = "checkpoint " + "s".repeat(2_000)
  const context = visibleConversationContext(items, summary)
  assert.ok(context.includes("Conversation checkpoint: checkpoint"))
  assert.ok(context.length <= DEFAULT_VISIBLE_CONTEXT_BUDGET + 40)
})

test("checkpointFor stays bounded and ignores private reasoning", () => {
  const items = Array.from({ length: 12 }, (_, index) => ({
    role: index % 2 ? "assistant" as const : "user" as const,
    logs: [
      { kind: "thought" as const, content: "private" },
      { kind: "text" as const, content: `visible-${index} ` + "v".repeat(800) },
    ],
  }))
  const checkpoint = checkpointFor(items)
  assert.ok(checkpoint)
  assert.ok(checkpoint!.length <= 3_000)
  assert.equal(checkpoint!.includes("private"), false)
})
