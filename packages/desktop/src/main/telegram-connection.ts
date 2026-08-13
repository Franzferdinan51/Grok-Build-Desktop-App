/**
 * Pure Telegram connection/pairing helpers.
 * No Electron or network — the bridge applies these, tests own the contract.
 */

export type TelegramChatProfile = {
  id: string
  type?: string
  title?: string
  username?: string
  firstName?: string
  lastName?: string
  lastSeenAt?: number
  lastPreview?: string
}

export type TelegramChatView = TelegramChatProfile & { label: string }

export type TelegramConnectionPhase = "setup" | "saved" | "cooling" | "error" | "ready" | "live"

export const PUBLIC_PAIRING_COMMANDS = new Set(["start", "help", "menu", "whoami", "id"])

export const ESSENTIAL_BOT_COMMANDS = [
  { command: "start", description: "Setup and command menu" },
  { command: "help", description: "Show command help" },
  { command: "menu", description: "Open the control menu" },
  { command: "run", description: "Run a Grok Build task" },
  { command: "status", description: "Show agent and workspace status" },
  { command: "health", description: "Quick health check" },
  { command: "models", description: "Choose a model" },
  { command: "project", description: "Choose a project" },
  { command: "mode", description: "Fast, balanced, or deep" },
  { command: "queue", description: "Show queued work" },
  { command: "steer", description: "Prioritize the next instruction" },
  { command: "interrupt", description: "Stop and redirect" },
  { command: "retry", description: "Retry the previous instruction" },
  { command: "undo", description: "Rewind the previous turn" },
  { command: "cancel", description: "Cancel the active task" },
  { command: "stop", description: "Stop the active task" },
  { command: "new", description: "Start a fresh session" },
  { command: "history", description: "Recent conversation" },
  { command: "workspace", description: "Show the working directory" },
  { command: "skills", description: "List loaded skills" },
  { command: "sethome", description: "Deliver scheduled results here" },
  { command: "approve", description: "Approve a held task" },
  { command: "deny", description: "Deny a held task" },
  { command: "whoami", description: "Show this chat id" },
] as const

export function parseChatIds(input: string): string[] {
  return [...new Set(input.split(/[\s,]+/).map((id) => id.trim()).filter((id) => /^-?\d+$/.test(id)))]
}

export function publicPairingCommandName(text: string): string | undefined {
  const match = text.trim().match(/^\/(\w+)(?:@\w+)?(?:\s|$)/)
  const name = match?.[1]?.toLowerCase()
  if (name && PUBLIC_PAIRING_COMMANDS.has(name)) return name
  return undefined
}

export function isPublicPairingCommand(text: string): boolean {
  return Boolean(publicPairingCommandName(text))
}

export type UnauthorizedRoute = "whoami" | "public-handler" | "cancel" | "first-pairing" | "repeat-wait"

export function routeUnauthorizedMessage(text: string, alreadyNotified: boolean): UnauthorizedRoute {
  const publicCommand = publicPairingCommandName(text)
  if (publicCommand === "whoami" || publicCommand === "id") return "whoami"
  if (publicCommand) return "public-handler"
  const name = text.trim().match(/^\/(\w+)/)?.[1]?.toLowerCase()
  if (name === "cancel" || name === "stop") return "cancel"
  return alreadyNotified ? "repeat-wait" : "first-pairing"
}

export function stillWaitingMessage(chatId: string): string {
  return `Still waiting for Approve in Grok Build Desktop → Agent → Telegram.\nChat id: ${chatId}`
}

export function parseTelegramRetryAfterMs(payload: unknown, fallbackMs: number): number {
  const record = payload && typeof payload === "object" ? payload as Record<string, unknown> : {}
  const parameters = record.parameters && typeof record.parameters === "object" ? record.parameters as Record<string, unknown> : {}
  const seconds = Number(parameters.retry_after ?? record.retry_after)
  if (Number.isFinite(seconds) && seconds > 0) return Math.min(5 * 60_000, Math.max(1_000, Math.floor(seconds * 1000)))
  const match = String(record.description || "").match(/retry after (\d+)/i)
  if (match) return Math.min(5 * 60_000, Math.max(1_000, Number(match[1]) * 1000))
  return Math.max(1_000, fallbackMs)
}

export type TelegramPollErrorKind = "auth" | "rate" | "conflict" | "other"
export type TelegramPollingDecision = "pause" | "backoff" | "retry" | "ok"

/** Control commands that must stay usable while a Grok Build turn is running. */
export const TELEGRAM_CONTROL_COMMANDS = new Set(["cancel", "stop", "status", "health", "queue", "steer", "interrupt"])

export function isTelegramControlCommand(text: string): boolean {
  const name = text.trim().match(/^\/(\w+)(?:@\w+)?(?:\s|$)/)?.[1]?.toLowerCase()
  return Boolean(name && TELEGRAM_CONTROL_COMMANDS.has(name))
}

/** After aborting getUpdates, wait before the next poller to avoid a self-409. */
export const TELEGRAM_RECONNECT_SETTLE_MS = 800

/**
 * Auth and getUpdates conflicts must stop the poller. Rate limits back off.
 * Other !ok payloads retry with the existing exponential delay.
 */
export function telegramPollingDecision(kind: TelegramPollErrorKind | undefined, ok: boolean): TelegramPollingDecision {
  if (kind === "auth" || kind === "conflict") return "pause"
  if (kind === "rate") return "backoff"
  if (!ok) return "retry"
  return "ok"
}

/**
 * Bootstrap (deleteWebhook) pauses only on a revoked token.
 * A 409/conflict here must not block getUpdates — webhook clear is optional.
 */
export function telegramBootstrapDecision(status: number, ok: boolean, description?: string): TelegramPollingDecision {
  const kind = classifyTelegramHttpError(status, description)?.kind
  if (kind === "auth") return "pause"
  if (kind === "rate") return "backoff"
  if (kind === "conflict") return "ok"
  if (!ok) return "retry"
  return "ok"
}

/** A timed-out getUpdates abort must keep the poller alive. */
export function telegramPollAbortShouldContinue(polling: boolean, sameGeneration: boolean): boolean {
  return polling && sameGeneration
}

/**
 * The UI may only show live/connected polling after bootstrap succeeded.
 * Intent-to-poll (`polling`) without `pollReady` is still starting.
 */
export function telegramPublicLiveness(input: { hasToken: boolean; polling: boolean; pollReady: boolean }): { connected: boolean; polling: boolean } {
  const live = Boolean(input.hasToken && input.polling && input.pollReady)
  return { connected: live, polling: live }
}

/** Connect must not treat 429 / 409 as a revoked token. */
export function shouldRecordConnectAuthFailure(kind: TelegramPollErrorKind | undefined, ok: boolean): boolean {
  if (kind === "rate" || kind === "conflict") return false
  return kind === "auth" || !ok
}

export function classifyTelegramHttpError(status: number, description?: string): { kind: TelegramPollErrorKind; message: string } | undefined {
  const desc = (description || "").trim()
  if (status === 409 || /terminated by other getUpdates|Conflict/i.test(desc)) {
    return {
      kind: "conflict",
      message: "Another process is already polling this bot. Stop the other desktop app, OpenClaw, or webhook, then tap Reconnect.",
    }
  }
  if (status === 401 || status === 403) {
    return {
      kind: "auth",
      message: `Telegram rejected the bot token (HTTP ${status}): ${desc || "unauthorized"}. Polling paused — reconnect in Agent → Telegram.`,
    }
  }
  if (status === 429) {
    return {
      kind: "rate",
      message: `Telegram rate-limited polling (HTTP 429): ${desc || "too many requests"}. Backing off — the bot is still connected.`,
    }
  }
  return undefined
}

export function pairingPublicReply(input: { chatId: string; botUsername?: string; label?: string; command: string }): string {
  const base = pairingMessage({ chatId: input.chatId, botUsername: input.botUsername, label: input.label })
  if (input.command === "whoami" || input.command === "id") return `Telegram chat id: ${input.chatId}\n\n${base}`
  return base
}

export function labelChat(profile: Pick<TelegramChatProfile, "id" | "username" | "firstName" | "lastName" | "title">): string {
  if (profile.username) return `@${profile.username}`
  const person = [profile.firstName, profile.lastName].filter(Boolean).join(" ").trim()
  if (person) return person
  if (profile.title) return profile.title
  return `Chat ${profile.id}`
}

export function hydrateChats(ids: string[], profiles: Record<string, TelegramChatProfile> | undefined): TelegramChatView[] {
  return ids.map((id) => {
    const profile = profiles?.[id] || { id }
    return { ...profile, id, label: labelChat(profile) }
  })
}

export function upsertChatProfile(
  profiles: Record<string, TelegramChatProfile> | undefined,
  next: TelegramChatProfile,
): Record<string, TelegramChatProfile> {
  const previous = profiles?.[next.id] || { id: next.id }
  const patch = Object.fromEntries(Object.entries(next).filter(([, value]) => value !== undefined)) as TelegramChatProfile
  return {
    ...profiles,
    [next.id]: {
      ...previous,
      ...patch,
      lastSeenAt: next.lastSeenAt || previous.lastSeenAt || Date.now(),
      lastPreview: next.lastPreview ?? previous.lastPreview,
    },
  }
}

export function approveChatState(allowed: string[], pending: string[], chatId: string): { allowed: string[]; pending: string[] } {
  const id = chatId.trim()
  return {
    allowed: [...new Set([...allowed, id].filter((entry) => /^-?\d+$/.test(entry)))],
    pending: pending.filter((entry) => entry !== id),
  }
}

export function denyChatState(pending: string[], chatId: string): string[] {
  return pending.filter((entry) => entry !== chatId.trim())
}

export function connectionPhase(input: {
  hasToken: boolean
  connected: boolean
  polling?: boolean
  error?: string
  coolOffMs?: number
}): TelegramConnectionPhase {
  if ((input.coolOffMs || 0) > 0) return "cooling"
  if (!input.hasToken) return "setup"
  if (input.error && !input.connected) return "error"
  if (input.connected && input.polling) return "live"
  if (input.connected) return "ready"
  return "saved"
}

export function pairingMessage(input: { chatId: string; botUsername?: string; label?: string }): string {
  const bot = input.botUsername ? `@${input.botUsername}` : "this bot"
  const who = input.label && input.label !== `Chat ${input.chatId}` ? `${input.label} (${input.chatId})` : `chat ${input.chatId}`
  return [
    "Pairing required.",
    "",
    `I see ${who}. ${bot} will not run Grok Build tasks until you approve this chat in the desktop app.`,
    "",
    "Open Grok Build Desktop → Agent → Telegram and tap Approve.",
    "You can still use /start, /help, and /whoami while you wait.",
  ].join("\n")
}

export function approvedMessage(botUsername?: string): string {
  const bot = botUsername ? `@${botUsername}` : "Grok Build Desktop"
  return `Approved. ${bot} will run Grok Build tasks for this chat.\nSend a task, or tap /menu.`
}

export function deniedMessage(): string {
  return "Desktop denied this chat. I will not run tasks here."
}

export function revokedMessage(): string {
  return "This chat is no longer authorized. Ask the desktop owner to approve it again."
}

export function profileFromTelegramChat(
  chat: { id: number | string; type?: string; title?: string; username?: string; first_name?: string; last_name?: string },
  preview?: string,
): TelegramChatProfile {
  return {
    id: String(chat.id),
    type: chat.type,
    title: chat.title,
    username: chat.username,
    firstName: chat.first_name,
    lastName: chat.last_name,
    lastSeenAt: Date.now(),
    lastPreview: preview?.replace(/\s+/g, " ").trim().slice(0, 80) || undefined,
  }
}

export function shouldAutoApproveFirst(allowedCount: number, autoApproveFirst: boolean): boolean {
  return autoApproveFirst && allowedCount === 0
}
