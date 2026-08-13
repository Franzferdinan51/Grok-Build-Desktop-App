import assert from "node:assert/strict"
import test from "node:test"
import { rendererTokenAfterSubmit } from "./telegram-secret.ts"
import { telegramStatusForRenderer, withDisconnectedState, withForgottenTokenState } from "../main/telegram-state.ts"

test("renderer forgets the BotFather token after submit", () => {
  assert.equal(rendererTokenAfterSubmit(), "")
})

test("renderer status sanitizer drops a token if one is present", () => {
  const publicStatus = telegramStatusForRenderer({ connected: true, polling: true, token: "123456:SECRET", username: "bot" })
  assert.equal("token" in publicStatus, false)
  assert.equal(publicStatus.username, "bot")
  assert.equal(publicStatus.connected, true)
})

test("pause keeps the encrypted token and forget removes it", () => {
  const saved = { token: "encrypted-blob", allowedChatIds: ["1"], homeChatId: "1" }
  const paused = withDisconnectedState(saved)
  assert.equal(paused.token, "encrypted-blob")
  assert.equal(paused.homeChatId, "1")
  const forgotten = withForgottenTokenState(saved)
  assert.equal(forgotten.token, undefined)
  assert.equal("token" in forgotten, false)
  assert.equal(forgotten.homeChatId, "1")
})
