import assert from "node:assert/strict"
import test from "node:test"
import { sessionSidebarEntries } from "./session-sidebar.ts"

const summary = (id: string, patch: Partial<{ title: string; updatedAt: number; pinned: boolean; archived: boolean; messageCount: number; workspace: string; model: string }> = {}) => ({
  id,
  workspace: patch.workspace || "/work/demo",
  title: patch.title || id,
  createdAt: 1,
  updatedAt: patch.updatedAt ?? 1,
  sessionId: "session-" + id,
  messageCount: patch.messageCount ?? 2,
  pinned: patch.pinned,
  archived: patch.archived,
  model: patch.model,
}) as never

test("session sidebar keeps pinned conversations first and bounds the list", () => {
  const entries = sessionSidebarEntries([
    summary("recent", { updatedAt: 30 }),
    summary("pinned", { updatedAt: 2, pinned: true }),
    summary("archived", { archived: true, updatedAt: 100 }),
    summary("empty", { messageCount: 0, updatedAt: 90 }),
  ], "", 2)
  assert.deepEqual(entries.map((entry) => entry.id), ["pinned", "recent"])
})

test("session sidebar searches title, workspace, and model", () => {
  const entries = [
    summary("title", { title: "Release audit" }),
    summary("workspace", { workspace: "/work/telegram-agent" }),
    summary("model", { model: "grok-4-fast" }),
  ]
  assert.equal(sessionSidebarEntries(entries, "release")[0]?.id, "title")
  assert.equal(sessionSidebarEntries(entries, "telegram")[0]?.id, "workspace")
  assert.equal(sessionSidebarEntries(entries, "fast")[0]?.id, "model")
})
