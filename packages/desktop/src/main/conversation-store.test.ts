import assert from "node:assert/strict"
import test from "node:test"
import { conversationSummary } from "./conversation-summary.ts"
import type { StoredChatThread } from "./conversation-store-types.ts"

test("conversationSummary keeps metadata while dropping transcript payloads", () => {
  const thread: StoredChatThread = {
    id: "thread-1",
    workspace: "/workspace",
    title: "A task",
    createdAt: 1,
    updatedAt: 2,
    sessionId: "session-1",
    messages: [
      { id: "m1", role: "user", createdAt: 1, logs: [{ kind: "text", content: "hello" }] },
      { id: "m2", role: "assistant", createdAt: 2, logs: [{ kind: "text", content: "world" }] },
    ],
  }
  assert.deepEqual(conversationSummary(thread), {
    id: "thread-1",
    workspace: "/workspace",
    title: "A task",
    createdAt: 1,
    updatedAt: 2,
    sessionId: "session-1",
    messageCount: 2,
  })
})
