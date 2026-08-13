import test from "node:test"
import assert from "node:assert/strict"
import { branchConversation } from "./conversation-branch.ts"
import type { StoredChatThread } from "../preload/index.ts"

const thread: StoredChatThread = {
  id: "original",
  workspace: "/workspace",
  title: "Original",
  createdAt: 1,
  updatedAt: 3,
  sessionId: "session-1",
  sessionStatus: "resumable",
  messages: [
    { id: "u1", role: "user", createdAt: 1, logs: [{ kind: "text", content: "Build the login screen" }] },
    { id: "a1", role: "assistant", createdAt: 2, logs: [{ kind: "text", content: "Done" }] },
    { id: "u2", role: "user", createdAt: 3, logs: [{ kind: "text", content: "Now add validation" }] },
  ],
}

test("branchConversation preserves earlier turns and starts a fresh session", () => {
  const result = branchConversation(thread, "u2", "branch-1", 10)
  assert.ok(result)
  assert.equal(result.prompt, "Now add validation")
  assert.deepEqual(result.thread.messages.map((message) => message.id), ["u1", "a1"])
  assert.equal(result.thread.sessionId, "")
  assert.equal(result.thread.sessionStatus, "new")
  assert.equal(result.thread.id, "branch-1")
  assert.match(result.thread.title, /^Branch · Now add validation/)
})

test("branchConversation rejects assistant, missing, and empty messages", () => {
  assert.equal(branchConversation(thread, "a1", "branch-2", 10), undefined)
  assert.equal(branchConversation(thread, "missing", "branch-3", 10), undefined)
  const empty = { ...thread, messages: [{ ...thread.messages[0], id: "empty", logs: [] }] }
  assert.equal(branchConversation(empty, "empty", "branch-4", 10), undefined)
})
