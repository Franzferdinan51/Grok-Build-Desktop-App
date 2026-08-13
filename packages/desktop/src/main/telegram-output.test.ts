import test from "node:test"
import assert from "node:assert/strict"
import { publicTelegramResponse, telegramEventText } from "./telegram-output.ts"

test("telegramEventText accepts headless and wrapped assistant events", () => {
  assert.equal(telegramEventText({ type: "text", data: "hello" }), "hello")
  assert.equal(telegramEventText({ type: "assistant_message", content: "wrapped" }), "wrapped")
  assert.equal(telegramEventText({ type: "tool_call", data: "ls" }), "")
})

test("publicTelegramResponse keeps the extracted public answer clean", () => {
  assert.equal(publicTelegramResponse("<think>private</think>Visible answer"), "Visible answer")
})
