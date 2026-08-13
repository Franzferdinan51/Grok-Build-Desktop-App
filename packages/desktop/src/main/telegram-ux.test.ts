import assert from "node:assert/strict"
import test from "node:test"
import {
  groupMessageShouldRun,
  inboundMentionsBot,
  normalizeTelegramAgentOptions,
  scheduledHomeNotice,
  scheduledHomeTarget,
  shouldSilenceTelegramSend,
  telegramPresenceText,
  telegramReactionEmoji,
} from "./telegram-ux.ts"

test("important notification mode silences only progress and activity", () => {
  assert.equal(shouldSilenceTelegramSend("progress", "important"), true)
  assert.equal(shouldSilenceTelegramSend("activity", "important"), true)
  assert.equal(shouldSilenceTelegramSend("final", "important"), false)
  assert.equal(shouldSilenceTelegramSend("approval", "important"), false)
  assert.equal(shouldSilenceTelegramSend("progress", "all"), false)
})

test("reactions and presence copy match Hermes visual language", () => {
  assert.equal(telegramReactionEmoji("started"), "👀")
  assert.equal(telegramReactionEmoji("completed"), "✅")
  assert.equal(telegramReactionEmoji("failed"), "❌")
  assert.match(telegramPresenceText(true), /Online/)
  assert.match(telegramPresenceText(false), /Offline/)
})

test("group mention gate keeps DMs and commands, drops unmentioned chatter", () => {
  assert.equal(groupMessageShouldRun({ chatType: "private", requireMention: true, text: "fix tests" }), true)
  assert.equal(groupMessageShouldRun({ chatType: "group", requireMention: false, text: "fix tests" }), true)
  assert.equal(groupMessageShouldRun({ chatType: "supergroup", requireMention: true, text: "fix tests" }), false)
  assert.equal(groupMessageShouldRun({ chatType: "supergroup", requireMention: true, text: "/status" }), true)
  assert.equal(groupMessageShouldRun({ chatType: "group", requireMention: true, text: "hey", mentionsBot: true }), true)
  assert.equal(groupMessageShouldRun({ chatType: "group", requireMention: true, text: "hey", replyToBot: true }), true)
  assert.equal(groupMessageShouldRun({ chatType: "supergroup", requireMention: true, text: "approve_task", isCallback: true }), true)
})

test("inbound mention detection uses @username, entities, and bot replies", () => {
  const mentioned = inboundMentionsBot({ text: "please @GrokBuild_bot summarize", botUsername: "GrokBuild_bot" })
  assert.equal(mentioned.mentionsBot, true)
  const entity = inboundMentionsBot({
    text: "hi @grokbuild_bot",
    botUsername: "grokbuild_bot",
    entities: [{ type: "mention", offset: 3, length: 14 }],
  })
  assert.equal(entity.mentionsBot, true)
  const reply = inboundMentionsBot({ text: "continue", botId: 9, replyFromId: 9, replyFromIsBot: true })
  assert.equal(reply.replyToBot, true)
  const other = inboundMentionsBot({ text: "continue", botUsername: "grokbuild_bot" })
  assert.equal(other.mentionsBot, false)
})

test("agent options default to Hermes important notifications and reactions", () => {
  const options = normalizeTelegramAgentOptions(undefined)
  assert.equal(options.reactions, true)
  assert.equal(options.notifications, "important")
  assert.equal(options.statusIndicator, true)
  assert.equal(options.requireMention, false)
  assert.equal(normalizeTelegramAgentOptions({ homeChatId: " 123 ", notifications: "all" }).homeChatId, "123")
  assert.equal(normalizeTelegramAgentOptions({ homeChatId: "nope" }).homeChatId, undefined)
})

test("scheduled home notices skip running ticks", () => {
  assert.equal(scheduledHomeNotice({ name: "Nightly", status: "running" }), undefined)
  assert.match(scheduledHomeNotice({ name: "Nightly", status: "completed", detail: "ok" }) || "", /Nightly/)
  assert.match(scheduledHomeNotice({ name: "Nightly", status: "failed", detail: "boom" }) || "", /failed/)
})

test("scheduled home delivery only targets an authorized chat", () => {
  assert.equal(scheduledHomeTarget("42", ["42", "9"]), "42")
  assert.equal(scheduledHomeTarget("42", ["9"]), undefined)
  assert.equal(scheduledHomeTarget(undefined, ["42"]), undefined)
  assert.equal(scheduledHomeTarget("nope", ["nope"]), undefined)
})
