import assert from "node:assert/strict"
import test from "node:test"
import { conversationToMarkdown, lastVisibleAssistantText, visibleMessageMarkdown } from "./conversation-markdown.ts"

const thread = {
  title: "Streaming fix",
  workspace: "/tmp/demo",
  updatedAt: Date.parse("2026-08-12T00:00:00.000Z"),
  model: "grok-4.5",
  summary: "Keep the parser honest",
  messages: [
    { role: "user" as const, logs: [{ kind: "text", content: "Fix the split JSON line" }] },
    {
      role: "assistant" as const,
      logs: [
        { kind: "thought", content: "private" },
        { kind: "text", content: "Done.\n<app_action>{\"type\":\"preview.open\"}</app_action>" },
      ],
    },
  ],
}

test("conversationToMarkdown exports visible turns and strips thoughts/actions", () => {
  const markdown = conversationToMarkdown(thread)
  assert.match(markdown, /^# Streaming fix/m)
  assert.match(markdown, /Fix the split JSON line/)
  assert.match(markdown, /Done\./)
  assert.match(markdown, /Keep the parser honest/)
  assert.doesNotMatch(markdown, /private/)
  assert.doesNotMatch(markdown, /preview\.open/)
})

test("lastVisibleAssistantText returns the latest public assistant reply", () => {
  assert.equal(lastVisibleAssistantText(thread), "Done.")
  assert.equal(visibleMessageMarkdown(thread.messages[0]!), "Fix the split JSON line")
  assert.equal(lastVisibleAssistantText({ messages: [] }), "")
})
