import assert from "node:assert/strict"
import test from "node:test"
import { rankConversationMatches, visibleThreadText } from "./conversation-search.ts"

const thread = (id: string, title: string, extras: Partial<Parameters<typeof rankConversationMatches>[0][number]> = {}) => ({
  id,
  title,
  updatedAt: extras.updatedAt ?? 1,
  messages: extras.messages ?? [{ logs: [{ kind: "text", content: "Public answer <app_action>{\"type\":\"preview.open\"}</app_action>" }, { kind: "thought", content: "secret plan" }] }],
  ...extras,
})

test("visibleThreadText excludes thoughts and app_action tags", () => {
  const text = visibleThreadText(thread("a", "Fix parser"))
  assert.match(text, /Fix parser/)
  assert.match(text, /Public answer/)
  assert.doesNotMatch(text, /secret plan/)
  assert.doesNotMatch(text, /app_action|preview\.open/)
})

test("rankConversationMatches requires every query token and prefers title hits", () => {
  const threads = [
    thread("body", "Notes", { messages: [{ logs: [{ kind: "text", content: "parser crash in streaming" }] }], updatedAt: 10 }),
    thread("title", "Streaming parser", { messages: [{ logs: [{ kind: "text", content: "unrelated" }] }], updatedAt: 5 }),
    thread("miss", "Other", { messages: [{ logs: [{ kind: "text", content: "parser only" }] }], updatedAt: 20 }),
  ]
  const ranked = rankConversationMatches(threads, "streaming parser")
  assert.equal(ranked[0]?.id, "title")
  assert.equal(ranked.some((entry) => entry.id === "miss"), false)
})

test("rankConversationMatches skips archived threads and boosts pinned ones", () => {
  const ranked = rankConversationMatches([
    thread("old", "retry helper", { updatedAt: 1 }),
    thread("pin", "retry helper", { pinned: true, updatedAt: 1 }),
    thread("gone", "retry helper", { archived: true, updatedAt: 99 }),
  ], "retry")
  assert.equal(ranked[0]?.id, "pin")
  assert.equal(ranked.some((entry) => entry.id === "gone"), false)
})
