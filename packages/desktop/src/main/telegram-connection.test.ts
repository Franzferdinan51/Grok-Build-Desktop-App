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
  parseTelegramRetryAfterMs,
  profileFromTelegramChat,
  routeUnauthorizedMessage,
  shouldAutoApproveFirst,
  shouldRecordConnectAuthFailure,
  stillWaitingMessage,
  telegramPollingDecision,
  telegramBootstrapDecision,
  telegramPollAbortShouldContinue,
  telegramPublicLiveness,
  upsertChatProfile,
  isTelegramControlCommand,
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

test("unauthorized pairing routes public commands and repeats waiting copy", () => {
  assert.equal(routeUnauthorizedMessage("/whoami", false), "whoami")
  assert.equal(routeUnauthorizedMessage("/start@MyBot", true), "public-handler")
  assert.equal(routeUnauthorizedMessage("/cancel", false), "cancel")
  assert.equal(routeUnauthorizedMessage("please fix this", false), "first-pairing")
  assert.equal(routeUnauthorizedMessage("please fix this", true), "repeat-wait")
  assert.match(stillWaitingMessage("99"), /99/)
})

test("parseTelegramRetryAfterMs prefers Telegram parameters", () => {
  assert.equal(parseTelegramRetryAfterMs({ parameters: { retry_after: 12 } }, 1000), 12_000)
  assert.equal(parseTelegramRetryAfterMs({ description: "Too Many Requests: retry after 8" }, 1000), 8_000)
  assert.equal(parseTelegramRetryAfterMs({}, 2500), 2500)
})

test("telegramPollingDecision pauses auth and getUpdates conflicts instead of hammering", () => {
  assert.equal(telegramPollingDecision("auth", false), "pause")
  assert.equal(telegramPollingDecision("conflict", false), "pause")
  assert.equal(telegramPollingDecision("rate", false), "backoff")
  assert.equal(telegramPollingDecision("other", false), "retry")
  assert.equal(telegramPollingDecision(undefined, false), "retry")
  assert.equal(telegramPollingDecision(undefined, true), "ok")
})

test("bootstrap uses the same HTTP classification as getUpdates", () => {
  assert.equal(telegramBootstrapDecision(401, false, "unauthorized"), "pause")
  assert.equal(telegramBootstrapDecision(409, false, "Conflict: terminated by other getUpdates"), "ok")
  assert.equal(telegramBootstrapDecision(429, false, "too many requests"), "backoff")
  assert.equal(telegramBootstrapDecision(200, false, "Could not clear webhook"), "retry")
  assert.equal(telegramBootstrapDecision(200, true), "ok")
})

test("a getUpdates abort keeps polling when the generation is still live", () => {
  assert.equal(telegramPollAbortShouldContinue(true, true), true)
  assert.equal(telegramPollAbortShouldContinue(true, false), false)
  assert.equal(telegramPollAbortShouldContinue(false, true), false)
})

test("public liveness stays dark until bootstrap marks the poller ready", () => {
  assert.deepEqual(telegramPublicLiveness({ hasToken: true, polling: true, pollReady: false }), { connected: false, polling: false })
  assert.deepEqual(telegramPublicLiveness({ hasToken: true, polling: false, pollReady: false }), { connected: false, polling: false })
  assert.deepEqual(telegramPublicLiveness({ hasToken: false, polling: true, pollReady: true }), { connected: false, polling: false })
  assert.deepEqual(telegramPublicLiveness({ hasToken: true, polling: true, pollReady: true }), { connected: true, polling: true })
})

test("connect does not treat 429 or 409 as a revoked token", () => {
  assert.equal(shouldRecordConnectAuthFailure("rate", false), false)
  assert.equal(shouldRecordConnectAuthFailure("conflict", false), false)
  assert.equal(shouldRecordConnectAuthFailure("auth", false), true)
  assert.equal(shouldRecordConnectAuthFailure(undefined, false), true)
  assert.equal(shouldRecordConnectAuthFailure(undefined, true), false)
})

test("control commands stay independent of a long agent turn", () => {
  assert.equal(isTelegramControlCommand("/cancel"), true)
  assert.equal(isTelegramControlCommand("/stop@MyBot"), true)
  assert.equal(isTelegramControlCommand("/status"), true)
  assert.equal(isTelegramControlCommand("/steer do this next"), true)
  assert.equal(isTelegramControlCommand("/interrupt stop and do X"), true)
  assert.equal(isTelegramControlCommand("/queue"), true)
  assert.equal(isTelegramControlCommand("/run fix tests"), false)
  assert.equal(isTelegramControlCommand("please fix tests"), false)
})

test("upsertChatProfile merges identity without dropping last preview", () => {
  const first = upsertChatProfile({}, profileFromTelegramChat({ id: 9, username: "a", first_name: "Ada" }, "/start"))
  const next = upsertChatProfile(first, profileFromTelegramChat({ id: 9, first_name: "Ada" }))
  assert.equal(next["9"]?.username, "a")
  assert.equal(next["9"]?.lastPreview, "/start")
  assert.equal(hydrateChats(["9"], next)[0]?.label, "@a")
})
