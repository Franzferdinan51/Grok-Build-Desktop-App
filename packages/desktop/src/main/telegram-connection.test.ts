import assert from "node:assert/strict"
import test from "node:test"
import {
  approveChatState,
  classifyTelegramHttpError,
  connectionPhase,
  denyChatState,
  hydrateChats,
  isPublicPairingCommand,
  labelChat,
  pairingMessage,
  pairingPublicReply,
  parseChatIds,
  profileFromTelegramChat,
  shouldAutoApproveFirst,
  upsertChatProfile,
} from "./telegram-connection.ts"

test("parseChatIds accepts comma or whitespace lists", () => {
  assert.deepEqual(parseChatIds(" 100, -200  100 "), ["100", "-200"])
})

test("pairing commands stay available before approval", () => {
  assert.equal(isPublicPairingCommand("/start@MyBot"), true)
  assert.equal(isPublicPairingCommand("/whoami"), true)
  assert.equal(isPublicPairingCommand("/run fix tests"), false)
  assert.equal(isPublicPairingCommand("hello"), false)
})

test("classifyTelegramHttpError separates conflict and rate limits from auth", () => {
  assert.equal(classifyTelegramHttpError(409, "Conflict: terminated by other getUpdates")?.kind, "conflict")
  assert.equal(classifyTelegramHttpError(429, "too many requests")?.kind, "rate")
  assert.equal(classifyTelegramHttpError(401, "unauthorized")?.kind, "auth")
  assert.match(classifyTelegramHttpError(401, "nope")?.message || "", /Agent → Telegram/)
  assert.match(pairingPublicReply({ chatId: "42", command: "whoami" }), /chat id: 42/)
})

test("labelChat prefers username then person then title", () => {
  assert.equal(labelChat({ id: "1", username: "duckets" }), "@duckets")
  assert.equal(labelChat({ id: "1", firstName: "Ada", lastName: "Lovelace" }), "Ada Lovelace")
  assert.equal(labelChat({ id: "1", title: "Build crew" }), "Build crew")
  assert.equal(labelChat({ id: "42" }), "Chat 42")
})

test("approve and deny mutate allow/pending lists", () => {
  assert.deepEqual(approveChatState(["1"], ["2", "3"], "2"), { allowed: ["1", "2"], pending: ["3"] })
  assert.deepEqual(denyChatState(["2", "3"], "2"), ["3"])
})

test("connectionPhase covers token, cool-off, and live polling", () => {
  assert.equal(connectionPhase({ hasToken: false, connected: false }), "setup")
  assert.equal(connectionPhase({ hasToken: true, connected: false, coolOffMs: 4000 }), "cooling")
  assert.equal(connectionPhase({ hasToken: true, connected: false, error: "bad token" }), "error")
  assert.equal(connectionPhase({ hasToken: true, connected: true, polling: true }), "live")
  assert.equal(connectionPhase({ hasToken: true, connected: true, polling: false }), "ready")
  assert.equal(connectionPhase({ hasToken: true, connected: false }), "saved")
})

test("pairing copy points at Agent → Telegram and includes the chat id", () => {
  const text = pairingMessage({ chatId: "99", botUsername: "grokbuild_bot", label: "@duckets" })
  assert.match(text, /Agent → Telegram/)
  assert.match(text, /99/)
  assert.match(text, /@grokbuild_bot/)
})

test("auto-approve only the first authorized chat", () => {
  assert.equal(shouldAutoApproveFirst(0, true), true)
  assert.equal(shouldAutoApproveFirst(1, true), false)
  assert.equal(shouldAutoApproveFirst(0, false), false)
})

test("upsertChatProfile merges identity without dropping last preview", () => {
  const first = upsertChatProfile({}, profileFromTelegramChat({ id: 9, username: "a", first_name: "Ada" }, "/start"))
  const next = upsertChatProfile(first, profileFromTelegramChat({ id: 9, first_name: "Ada" }))
  assert.equal(next["9"]?.username, "a")
  assert.equal(next["9"]?.lastPreview, "/start")
  assert.equal(hydrateChats(["9"], next)[0]?.label, "@a")
})
