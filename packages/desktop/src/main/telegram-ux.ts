/**
 * Pure Telegram UX helpers adapted from Hermes Agent and OpenClaw.
 * No Electron or network — tests and the smoke harness own the contract.
 */

export type TelegramNotificationMode = "important" | "all"
export type TelegramSendKind = "progress" | "activity" | "final" | "approval" | "pairing"
export type TelegramReactionPhase = "started" | "completed" | "failed" | "cancelled"

export type TelegramAgentOptions = {
  requireMention: boolean
  reactions: boolean
  notifications: TelegramNotificationMode
  statusIndicator: boolean
  homeChatId?: string
}

export type TelegramInboundMeta = {
  messageId?: number
  chatType?: string
  replyToBot?: boolean
  mentionsBot?: boolean
}

const DEFAULT_OPTIONS: TelegramAgentOptions = {
  requireMention: false,
  reactions: true,
  notifications: "important",
  statusIndicator: true,
}

export function normalizeTelegramAgentOptions(input?: Partial<TelegramAgentOptions> | null): TelegramAgentOptions {
  const notifications = input?.notifications === "all" ? "all" : "important"
  const homeChatId = typeof input?.homeChatId === "string" && /^-?\d+$/.test(input.homeChatId.trim())
    ? input.homeChatId.trim()
    : undefined
  return {
    requireMention: Boolean(input?.requireMention),
    reactions: input?.reactions !== false,
    notifications,
    statusIndicator: input?.statusIndicator !== false,
    homeChatId,
  }
}

export function shouldSilenceTelegramSend(kind: TelegramSendKind, mode: TelegramNotificationMode = "important"): boolean {
  if (mode === "all") return false
  return kind === "progress" || kind === "activity"
}

export function telegramReactionEmoji(phase: TelegramReactionPhase): string {
  if (phase === "started") return "👀"
  if (phase === "completed") return "✅"
  return "❌"
}

export function telegramPresenceText(online: boolean): string {
  return online ? "🟢 Online — Grok Build Desktop" : "🔴 Offline"
}

export function inboundMentionsBot(input: {
  text: string
  botUsername?: string
  botId?: number
  entities?: { type: string; offset: number; length: number }[]
  replyFromId?: number
  replyFromIsBot?: boolean
}): { mentionsBot: boolean; replyToBot: boolean } {
  const username = (input.botUsername || "").replace(/^@/, "").toLowerCase()
  const replyToBot = Boolean(input.replyFromIsBot && (!input.botId || input.replyFromId === input.botId))
  let mentionsBot = false
  if (username) {
    const mention = `@${username}`
    if (new RegExp(`(^|\\s)${mention}\\b`, "i").test(input.text)) mentionsBot = true
    if (input.entities?.some((entity) => {
      if (entity.type !== "mention") return false
      const slice = input.text.slice(entity.offset, entity.offset + entity.length).replace(/^@/, "").toLowerCase()
      return slice === username
    })) mentionsBot = true
  }
  return { mentionsBot, replyToBot }
}

/**
 * Hermes/OpenClaw group gate: when requireMention is on, group chatter is
 * ignored unless it is a slash command, a reply to the bot, or an @mention.
 */
export function groupMessageShouldRun(input: {
  chatType?: string
  requireMention: boolean
  text: string
  mentionsBot?: boolean
  replyToBot?: boolean
}): boolean {
  if (!input.requireMention) return true
  const type = (input.chatType || "private").toLowerCase()
  if (type === "private") return true
  if (input.replyToBot) return true
  if (input.mentionsBot) return true
  return input.text.trim().startsWith("/")
}

export function scheduledHomeNotice(event: { name: string; status: "running" | "completed" | "failed"; detail?: string }): string | undefined {
  if (event.status === "running") return undefined
  const headline = event.status === "completed" ? "🏠 Scheduled task finished" : "🏠 Scheduled task failed"
  return `${headline}: ${event.name}${event.detail ? `\n${event.detail}` : ""}`
}

export { DEFAULT_OPTIONS as DEFAULT_TELEGRAM_AGENT_OPTIONS }
