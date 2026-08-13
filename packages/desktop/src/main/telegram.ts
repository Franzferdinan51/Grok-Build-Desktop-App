/** Local Telegram Bot API bridge. Tokens are encrypted with Electron safeStorage. */
import { safeStorage } from "electron"
import { getStore, type StoreSchema } from "./store"
import { encryptedTelegramTokenPresent, telegramTokenFailureMessage } from "./store-defaults"
import { telegramInlineKeyboard, type TelegramReply } from "./telegram-format"
import { write as writeLog } from "./logging"
import { telegramHtml, telegramTextChunks } from "./telegram-text"
import { telegramStatusForRenderer, withDisconnectedState, withForgottenTokenState } from "./telegram-state.ts"
import {
  ESSENTIAL_BOT_COMMANDS,
  approveChatState,
  approvedMessage,
  classifyTelegramHttpError,
  denyChatState,
  telegramPollingDecision,
  telegramBootstrapDecision,
  telegramConflictRetryDelayMs,
  telegramPollAbortShouldContinue,
  telegramPublicLiveness,
  telegramDeleteWebhookBody,
  telegramGetUpdatesBody,
  TELEGRAM_RECONNECT_SETTLE_MS,
  shouldRecordConnectAuthFailure,
  deniedMessage,
  hydrateChats,
  labelChat,
  pairingPublicReply,
  parseTelegramRetryAfterMs,
  profileFromTelegramChat,
  publicPairingCommandName,
  revokedMessage,
  routeUnauthorizedMessage,
  shouldAutoApproveFirst,
  stillWaitingMessage,
  upsertChatProfile,
  type TelegramChatProfile,
  type TelegramChatView,
} from "./telegram-connection.ts"
import {
  groupMessageShouldRun,
  inboundMentionsBot,
  normalizeTelegramAgentOptions,
  shouldSilenceTelegramSend,
  telegramPresenceText,
  type TelegramAgentOptions,
  type TelegramInboundMeta,
  type TelegramSendKind,
} from "./telegram-ux.ts"

export type TelegramStatus = {
  connected: boolean
  hasToken?: boolean
  polling?: boolean
  username?: string
  firstName?: string
  botId?: number
  error?: string
  lastPollAt?: number
  lastError?: string
  webhookCleared?: boolean
  commandMenuOk?: boolean
  allowedCount?: number
  pendingCount?: number
  autoApproveFirst?: boolean
  /** Cooldown remaining before a retried connect attempt will be honoured. */
  coolOffMs?: number
  requireMention?: boolean
  reactions?: boolean
  notifications?: "important" | "all"
  statusIndicator?: boolean
  homeChatId?: string
}

export type { TelegramChatView }

export type TelegramResponse<T> = { status: number; payload: T }

async function telegramRequest<T>(url: string, init?: RequestInit): Promise<TelegramResponse<T>> {
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000), ...init })
  const payload = await response.json().catch(() => undefined) as T | undefined
  if (!payload) throw new Error(`Telegram returned an invalid response (${response.status})`)
  return { status: response.status, payload }
}

function telegramAuthError(status: number, description?: string): Error | undefined {
  const classified = classifyTelegramHttpError(status, description)
  if (classified?.kind !== "auth") return undefined
  return new Error(classified.message)
}

/** Wrap telegramRequest so legacy callers still receive the raw payload. */
async function telegramPayload<T>(url: string, init?: RequestInit): Promise<T> {
  return (await telegramRequest<T>(url, init)).payload
}

function telegramConfig(): StoreSchema["telegram"] {
  return getStore().get("telegram") || { allowedChatIds: [], pendingChatIds: [] }
}

// Apply a partial `telegram` store patch under a serialised mutation queue.
// Every persistence-touching call site in TelegramBridge funnels through
// here so two concurrent reads-modify-writes can never overwrite each
// other's patch. The chain serialises tasks; failures are logged.
let mutationQueue: Promise<unknown> = Promise.resolve()
function enqueueTelegramMutation<T>(task: () => T | Promise<T>): Promise<T> {
  // Two-stage chain: first resolve with the task outcome (typed T), then
  // drop the previous rejection tail so a poisoned queue does not break
  // the next task. The visible `next` keeps the typed value for the caller.
  let resolveNext: (value: T) => void
  let rejectNext: (reason: unknown) => void
  const publicPromise = new Promise<T>((resolve, reject) => { resolveNext = resolve; rejectNext = reject })
  mutationQueue = mutationQueue.then(
    async () => {
      try {
        resolveNext(await task())
      } catch (error) {
        writeLog("error", `Telegram mutation failed: ${error instanceof Error ? error.message : String(error)}`)
        rejectNext(error)
      }
    },
    () => undefined,
  )
  return publicPromise
}

export class TelegramBridge {
  private polling = false
  private pollReady = false
  private pollGeneration = 0
  private offset = 0
  private handler?: (chatId: string, text: string, meta?: TelegramInboundMeta) => Promise<string | TelegramReply>
  private unauthorizedNotified = new Set<string>()
  // Exponential backoff base for transient polling failures. Resets on the
  // next successful poll, so a sustained outage does not permanently penalise
  // the bridge once Telegram recovers.
  private retryDelayMs = 1_000
  private static readonly MAX_RETRY_DELAY_MS = 60_000
  // Circuit breaker: consecutive auth failures (401/403/429) cool off the
  // bridge for `coolOffMs` before the user can manually retry. The previous
  // implementation paused on first auth failure with no UI re-entry point,
  // so a transient 429 left the user staring at "Polling paused" until
  // they manually opened Settings → Agent → Telegram.
  private coolOffMs = 0
  private coolOffUntil = 0
  private consecutiveAuthFailures = 0
  private lastAuthFailureAt = 0
  private static readonly MAX_COOL_OFF_MS = 5 * 60_000
  private static readonly AUTH_FAILURE_WINDOW_MS = 10 * 60_000
  private lastPollAt = 0
  private lastError = ""
  private webhookCleared = false
  private commandMenuOk = false
  private botFirstName = ""
  private lastUsername = ""
  private lastBotId = 0
  private lastProbeAt = 0
  private conflictAttempts = 0
  private pollAbort?: AbortController
  private changeListeners = new Set<() => void>()

  setMessageHandler(handler: (chatId: string, text: string, meta?: TelegramInboundMeta) => Promise<string | TelegramReply>): void { this.handler = handler }

  agentOptions(): TelegramAgentOptions {
    return normalizeTelegramAgentOptions(telegramConfig())
  }

  async setAgentOptions(patch: Partial<TelegramAgentOptions>): Promise<TelegramAgentOptions> {
    return enqueueTelegramMutation(async () => {
      const next = normalizeTelegramAgentOptions({ ...this.agentOptions(), ...patch })
      getStore().set("telegram", { ...getStore().get("telegram"), ...next })
      this.notifyChange()
      return next
    })
  }

  onChange(listener: () => void): () => void {
    this.changeListeners.add(listener)
    return () => { this.changeListeners.delete(listener) }
  }

  private notifyChange(): void {
    for (const listener of this.changeListeners) {
      try { listener() } catch { /* renderer listeners must never break the bridge */ }
    }
  }

  allowedChats(): string[] { return telegramConfig().allowedChatIds || [] }
  pendingChats(): string[] { return telegramConfig().pendingChatIds || [] }

  /**
   * The portion of `coolOffMs` still in effect, used by `status()` so the
   * renderer can surface the recovery notice without poking the bridge.
   */
  coolOffRemaining(): number {
    if (!this.coolOffUntil) return 0
    return Math.max(0, this.coolOffUntil - Date.now())
  }

  /** Persisted mutation: rebuild the allowed-chat allow-list. */
  async setAllowedChats(chatIds: string[]): Promise<string[]> {
    return enqueueTelegramMutation(async () => {
      const allowedChatIds = [...new Set(chatIds.map((id) => id.trim()).filter((id) => /^-?\d+$/.test(id)))]
      getStore().set("telegram", { ...getStore().get("telegram"), allowedChatIds, pendingChatIds: this.pendingChats().filter((id) => !allowedChatIds.includes(id)) })
      for (const id of allowedChatIds) this.unauthorizedNotified.delete(id)
      this.notifyChange()
      return allowedChatIds
    })
  }

  /** Persisted mutation: drop a chat into the pending allow-list. */
  async addPendingChat(chatId: string, profile?: TelegramChatProfile): Promise<void> {
    return enqueueTelegramMutation(async () => {
      const current = getStore().get("telegram")
      const pendingChatIds = this.pendingChats().includes(chatId) ? this.pendingChats() : [...this.pendingChats(), chatId]
      getStore().set("telegram", {
        ...current,
        pendingChatIds,
        chatProfiles: profile ? upsertChatProfile(current.chatProfiles, profile) : current.chatProfiles,
      })
      this.notifyChange()
    })
  }

  chats(): { allowed: TelegramChatView[]; pending: TelegramChatView[] } {
    const profiles = getStore().get("telegram").chatProfiles
    return {
      allowed: hydrateChats(this.allowedChats(), profiles),
      pending: hydrateChats(this.pendingChats(), profiles),
    }
  }

  autoApproveFirst(): boolean {
    return Boolean(getStore().get("telegram").autoApproveFirst)
  }

  async setAutoApproveFirst(enabled: boolean): Promise<boolean> {
    return enqueueTelegramMutation(async () => {
      getStore().set("telegram", { ...getStore().get("telegram"), autoApproveFirst: enabled })
      return enabled
    })
  }

  async reconnect(): Promise<TelegramStatus> {
    if (this.coolOffRemaining() > 0) {
      return this.snapshot({ connected: false, error: `Telegram cooling off for ${Math.ceil(this.coolOffRemaining() / 1000)}s after repeated auth failures. Try again then.` })
    }
    if (!this.token()) return this.snapshot({ connected: false, hasToken: false, error: "No saved bot token. Paste a BotFather token to connect." })
    this.stop()
    await new Promise((resolve) => setTimeout(resolve, TELEGRAM_RECONNECT_SETTLE_MS))
    return this.startUntilReady()
  }

  async approveChat(chatId: string): Promise<string[]> {
    const next = approveChatState(this.allowedChats(), this.pendingChats(), chatId)
    const saved = await this.setAllowedChats(next.allowed)
    await this.send(chatId, approvedMessage(this.lastUsername || undefined))
    return saved
  }

  async denyChat(chatId: string): Promise<string[]> {
    await enqueueTelegramMutation(async () => {
      getStore().set("telegram", { ...getStore().get("telegram"), pendingChatIds: denyChatState(this.pendingChats(), chatId) })
      this.notifyChange()
    })
    await this.send(chatId, deniedMessage())
    return this.pendingChats()
  }

  async revokeChat(chatId: string): Promise<string[]> {
    const saved = await this.setAllowedChats(this.allowedChats().filter((id) => id !== chatId.trim()))
    await this.send(chatId, revokedMessage())
    return saved
  }

  private rememberChat(profile: TelegramChatProfile): void {
    void enqueueTelegramMutation(async () => {
      const current = getStore().get("telegram")
      getStore().set("telegram", { ...current, chatProfiles: upsertChatProfile(current.chatProfiles, profile) })
    })
  }

  /** Persisted mutation: write the high-water offset. */
  async persistOffset(): Promise<void> {
    const offset = this.offset
    return enqueueTelegramMutation(async () => {
      getStore().set("telegram", { ...getStore().get("telegram"), updateOffset: offset })
    })
  }

  private tokenUnlockError(): string {
    const hasEncrypted = encryptedTelegramTokenPresent(telegramConfig())
    const decrypted = Boolean(this.token())
    return telegramTokenFailureMessage({
      hasEncrypted,
      encryptionAvailable: safeStorage.isEncryptionAvailable(),
      decrypted,
    })
  }

  private token(): string | undefined {
    const encrypted = telegramConfig().token
    if (!encrypted) return undefined
    if (!safeStorage.isEncryptionAvailable()) return undefined
    try { return safeStorage.decryptString(Buffer.from(encrypted, "base64")) }
    catch { return undefined }
  }

  private snapshot(partial: Partial<TelegramStatus> = {}): TelegramStatus {
    const hasToken = encryptedTelegramTokenPresent(telegramConfig())
    const live = telegramPublicLiveness({ hasToken: Boolean(this.token()), polling: this.polling, pollReady: this.pollReady })
    return telegramStatusForRenderer({
      connected: live.connected,
      hasToken,
      polling: live.polling,
      firstName: this.botFirstName || undefined,
      lastPollAt: this.lastPollAt || undefined,
      lastError: this.lastError || this.tokenUnlockError() || undefined,
      webhookCleared: this.webhookCleared,
      commandMenuOk: this.commandMenuOk,
      allowedCount: this.allowedChats().length,
      pendingCount: this.pendingChats().length,
      autoApproveFirst: Boolean(telegramConfig().autoApproveFirst),
      coolOffMs: this.coolOffRemaining(),
      ...this.agentOptions(),
      ...partial,
    }) as TelegramStatus
  }

  async status(options: { probe?: boolean } = {}): Promise<TelegramStatus> {
    const token = this.token()
    if (!token) return this.snapshot({ connected: false, polling: false, coolOffMs: 0, error: this.tokenUnlockError() || undefined })
    const coolOffRemaining = this.coolOffRemaining()
    const live = telegramPublicLiveness({ hasToken: true, polling: this.polling, pollReady: this.pollReady })
    // Live long-poll is the source of truth only after bootstrap succeeded.
    // Intent-to-poll without pollReady must not look connected/live.
    if (this.polling && this.pollReady && !options.probe) {
      return this.snapshot({
        connected: live.connected,
        hasToken: true,
        polling: live.polling,
        botId: this.lastBotId || undefined,
        username: this.lastUsername || undefined,
        firstName: this.botFirstName || undefined,
        coolOffMs: coolOffRemaining,
        error: this.lastError || undefined,
      })
    }
    if (!options.probe && this.lastProbeAt && Date.now() - this.lastProbeAt < 60_000) {
      return this.snapshot({
        connected: live.connected,
        hasToken: true,
        polling: live.polling,
        botId: this.lastBotId || undefined,
        username: this.lastUsername || undefined,
        firstName: this.botFirstName || undefined,
        coolOffMs: coolOffRemaining,
        error: this.lastError || undefined,
      })
    }
    try {
      const response = await telegramRequest<{ ok: boolean; result?: { id: number; username?: string; first_name?: string }; description?: string }>(`https://api.telegram.org/bot${token}/getMe`)
      this.lastProbeAt = Date.now()
      const classified = classifyTelegramHttpError(response.status, response.payload.description)
      if (classified?.kind === "auth") {
        this.lastError = classified.message
        return this.snapshot({ connected: false, error: classified.message, coolOffMs: coolOffRemaining })
      }
      if (classified?.kind === "rate" || classified?.kind === "conflict") {
        this.lastError = classified.message
        return this.snapshot({
          ...telegramPublicLiveness({ hasToken: true, polling: this.polling, pollReady: this.pollReady }),
          error: classified.message,
          username: this.lastUsername || undefined,
          firstName: this.botFirstName || undefined,
          coolOffMs: coolOffRemaining,
        })
      }
      const payload = response.payload
      if (!payload.ok || !payload.result) {
        const error = classified?.message || payload.description || "Telegram rejected the token"
        this.lastError = error
        return this.snapshot({
          ...telegramPublicLiveness({ hasToken: true, polling: this.polling, pollReady: this.pollReady }),
          error,
          username: this.lastUsername || undefined,
          firstName: this.botFirstName || undefined,
          coolOffMs: coolOffRemaining,
        })
      }
      this.coolOffUntil = 0
      this.consecutiveAuthFailures = 0
      this.botFirstName = payload.result.first_name || ""
      this.lastUsername = payload.result.username || ""
      this.lastBotId = payload.result.id
      this.lastProbeAt = Date.now()
      this.lastError = ""
      return this.snapshot({
        ...telegramPublicLiveness({ hasToken: true, polling: this.polling, pollReady: this.pollReady }),
        botId: payload.result.id,
        username: payload.result.username,
        firstName: payload.result.first_name,
        coolOffMs: 0,
        error: undefined,
      })
    } catch (error) {
      this.lastProbeAt = Date.now()
      const message = (error as Error).message
      if (!this.polling) this.lastError = message
      return this.snapshot({
        ...telegramPublicLiveness({ hasToken: true, polling: this.polling, pollReady: this.pollReady }),
        error: this.polling && this.pollReady ? this.lastError || message : message,
        username: this.lastUsername || undefined,
        firstName: this.botFirstName || undefined,
        coolOffMs: coolOffRemaining,
      })
    }
  }

  async connect(token: string): Promise<TelegramStatus> {
    if (this.coolOffRemaining() > 0) {
      return this.snapshot({ connected: false, error: `Telegram cooling off for ${Math.ceil(this.coolOffRemaining() / 1000)}s after repeated auth failures. Try again then.` })
    }
    if (!safeStorage.isEncryptionAvailable()) return this.snapshot({ connected: false, error: "OS credential encryption is unavailable" })
    const clean = token.trim()
    if (!/^\d{6,}:[A-Za-z0-9_-]{20,}$/.test(clean)) return this.snapshot({ connected: false, error: "That does not look like a Telegram BotFather token" })
    try {
      const response = await telegramRequest<{ ok: boolean; result?: { id: number; username?: string; first_name?: string }; description?: string }>(`https://api.telegram.org/bot${clean}/getMe`)
      const payload = response.payload
      const classified = classifyTelegramHttpError(response.status, payload.description)
      const result = payload.result
      const ok = Boolean(payload.ok && result)
      if (shouldRecordConnectAuthFailure(classified?.kind, ok)) this.recordAuthFailure()
      if (classified?.kind === "rate" || classified?.kind === "conflict") {
        this.lastError = classified.message
        return this.snapshot({ connected: this.polling, error: classified.message })
      }
      if (!ok || !result) {
        const error = telegramAuthError(response.status, payload.description)?.message || classified?.message || payload.description || "Telegram rejected the token"
        this.lastError = error
        return this.snapshot({ connected: false, error })
      }
      // A successful connect clears the breaker and the auth-failure cache
      // so a chat that was auto-paired once can re-pair after a fresh
      // connect without the bridge declaring it "already notified".
      this.coolOffUntil = 0
      this.consecutiveAuthFailures = 0
      this.unauthorizedNotified = new Set()
      this.offset = 0
      await enqueueTelegramMutation(async () => {
        getStore().set("telegram", { ...getStore().get("telegram"), token: safeStorage.encryptString(clean).toString("base64"), updateOffset: 0 })
      })
      this.botFirstName = result.first_name || ""
      this.lastUsername = result.username || ""
      this.lastBotId = result.id
      this.lastProbeAt = Date.now()
      this.lastError = ""
      this.notifyChange()
      return this.startUntilReady()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.lastError = message
      return this.snapshot({ connected: false, error: message })
    }
  }

  private recordAuthFailure(): void {
    const now = Date.now()
    const { MAX_COOL_OFF_MS, AUTH_FAILURE_WINDOW_MS } = TelegramBridge
    if (now - this.lastAuthFailureAt > AUTH_FAILURE_WINDOW_MS) this.consecutiveAuthFailures = 0
    this.lastAuthFailureAt = now
    this.consecutiveAuthFailures += 1
    const factor = Math.min(this.consecutiveAuthFailures, 6)
    this.coolOffMs = Math.min(MAX_COOL_OFF_MS, 5_000 * 2 ** factor)
    this.coolOffUntil = now + this.coolOffMs
    if (this.consecutiveAuthFailures > 3) {
      writeLog("error", `Telegram bridge entered ${this.coolOffMs / 1000}s cool-off after ${this.consecutiveAuthFailures} consecutive auth failures (window ${AUTH_FAILURE_WINDOW_MS / 1000}s)`)
    }
  }

  async disconnect(): Promise<void> {
    this.stop()
    await enqueueTelegramMutation(async () => {
      getStore().set("telegram", withDisconnectedState(getStore().get("telegram")))
      this.notifyChange()
    })
  }

  /**
   * Hard disconnect: drop the encrypted bot token from disk entirely.
   * Previously `disconnect()` left the token in place, which silently
   * contradicted the rest of the file's encryption posture and the user's
   * expectation when they clicked the Settings → Remove token control.
   */
  async forgetToken(): Promise<void> {
    this.stop()
    this.unauthorizedNotified.clear()
    this.coolOffUntil = 0
    this.consecutiveAuthFailures = 0
    this.lastUsername = ""
    this.lastBotId = 0
    this.lastProbeAt = 0
    await enqueueTelegramMutation(async () => {
      getStore().set("telegram", withForgottenTokenState(getStore().get("telegram")))
      this.notifyChange()
    })
  }

  start(): void {
    if (!this.token()) {
      const unlock = this.tokenUnlockError()
      writeLog("warn", unlock || "Telegram start skipped: no bot token saved")
      return
    }
    if (this.pollReady && this.polling) return
    if (this.polling && !this.pollReady) return
    void this.startUntilReady()
  }

  /** Restart a dead poller (second-instance focus, delayed keychain token). */
  ensurePolling(): void {
    if (!encryptedTelegramTokenPresent(telegramConfig())) return
    if (this.coolOffRemaining() > 0) return
    if (this.pollReady && this.polling) return
    if (this.polling && !this.pollReady) return
    this.start()
  }

  private async startUntilReady(): Promise<TelegramStatus> {
    if (!this.token()) return this.snapshot({ connected: false, hasToken: false, polling: false, error: "No saved bot token. Paste a BotFather token to connect." })
    if (this.polling && this.pollReady) return this.status({ probe: false })
    this.offset = Number(getStore().get("telegram").updateOffset) || 0
    this.pollReady = false
    this.polling = true
    const generation = ++this.pollGeneration
    const ready = await this.preparePolling(generation)
    if (ready && this.polling && generation === this.pollGeneration) {
      this.pollReady = true
      this.notifyChange()
      void this.poll(generation)
    }
    return this.status({ probe: false })
  }

  stop(): void {
    const goingOffline = this.pollReady && Boolean(this.token())
    this.polling = false
    this.pollReady = false
    this.pollGeneration++
    this.pollAbort?.abort()
    this.pollAbort = undefined
    if (goingOffline) void this.setPresence(false)
  }

  /**
   * Clear webhook and apply the same HTTP classification as getUpdates.
   * Returns true only when bootstrap succeeded; auth/conflict pause the poller.
   */
  private async preparePolling(generation: number): Promise<boolean> {
    while (this.polling && generation === this.pollGeneration) {
      const token = this.token()
      if (!token) {
        this.polling = false
        this.pollReady = false
        return false
      }
      try {
        const response = await telegramRequest<{ ok: boolean; description?: string }>(`https://api.telegram.org/bot${token}/deleteWebhook`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(telegramDeleteWebhookBody(true)),
        })
        const payload = response.payload
        const decision = telegramBootstrapDecision(response.status, Boolean(payload.ok), payload.description)
        if (decision === "pause") {
          const classified = classifyTelegramHttpError(response.status, payload.description)
          if (classified?.kind === "auth") this.recordAuthFailure()
          this.lastError = classified?.message || payload.description || "Telegram bootstrap paused"
          writeLog("error", `Telegram bootstrap paused: ${this.lastError}`)
          this.polling = false
          this.pollReady = false
          this.notifyChange()
          return false
        }
        if (decision === "backoff") {
          this.lastError = classifyTelegramHttpError(response.status, payload.description)?.message || payload.description || "Telegram rate-limited"
          this.retryDelayMs = parseTelegramRetryAfterMs(payload, Math.min(this.retryDelayMs * 2, TelegramBridge.MAX_RETRY_DELAY_MS))
          writeLog("error", `Telegram bootstrap rate-limited; waiting ${this.retryDelayMs / 1000}s`)
          await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs))
          continue
        }
        if (decision === "retry") {
          this.lastError = payload.description || "Could not clear Telegram webhook"
          this.retryDelayMs = Math.min(this.retryDelayMs * 2 + Math.floor(Math.random() * 1_000), TelegramBridge.MAX_RETRY_DELAY_MS)
          writeLog("error", `Telegram bootstrap failed: ${this.lastError}`)
          await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs))
          continue
        }
        this.webhookCleared = true
        this.lastError = ""
        this.retryDelayMs = 1_000
        writeLog("info", `Telegram polling started at update ${this.offset}`)
        void this.configureCommands()
        void this.setPresence(true)
        return true
      } catch (error) {
        if (!this.polling || generation !== this.pollGeneration) return false
        this.lastError = error instanceof Error ? error.message : String(error)
        writeLog("error", `Telegram bootstrap failed: ${this.lastError}`)
        this.retryDelayMs = Math.min(this.retryDelayMs * 2 + Math.floor(Math.random() * 1_000), TelegramBridge.MAX_RETRY_DELAY_MS)
        await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs))
      }
    }
    return false
  }

  private async poll(generation: number): Promise<void> {
    while (this.polling && generation === this.pollGeneration) {
      try {
        const token = this.token()
        if (!token) return
        // Apply backoff before the next request when we previously failed. The
        // jitter prevents synchronised retry storms from many desktop clients
        // that lost connectivity at the same moment.
        if (this.retryDelayMs > 1_000) await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs))
        this.pollAbort?.abort()
        const pollAbort = new AbortController()
        this.pollAbort = pollAbort
        const timeout = setTimeout(() => pollAbort.abort(), 35_000)
        let response: TelegramResponse<{ ok: boolean; result?: { update_id: number; message?: { message_id?: number; text?: string; entities?: { type: string; offset: number; length: number }[]; reply_to_message?: { from?: { id?: number; is_bot?: boolean } }; chat: { id: number; type?: string; title?: string; username?: string; first_name?: string; last_name?: string } }; callback_query?: { id: string; data?: string; message?: { message_id?: number; chat: { id: number; type?: string; title?: string; username?: string; first_name?: string; last_name?: string } } } }[]; description?: string }>
        try {
          // Hermes uses POST getUpdates so allowed_updates and offset are reliable.
          response = await telegramRequest(`https://api.telegram.org/bot${token}/getUpdates`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(telegramGetUpdatesBody(this.offset)),
            signal: pollAbort.signal,
          })
        } finally {
          clearTimeout(timeout)
        }
        // An invalid bot token returns HTTP 401/403; rate limiting returns 429.
        // Busily retrying every 2s hammers Telegram and never recovers on its
        // own. Hand the failure to the circuit breaker so a sustained outage
        // backs off instead of pinning the bridge into "stopped" with no UI
        // recovery path. The user can hit Connect again after the cool-off.
        const payload = response.payload
        const classified = classifyTelegramHttpError(response.status, payload.description)
        const decision = telegramPollingDecision(classified?.kind, Boolean(payload.ok))
        if (decision === "pause") {
          if (classified?.kind === "auth") this.recordAuthFailure()
          this.lastError = classified?.message || payload.description || "Telegram polling paused"
          writeLog("error", `Telegram polling paused: ${this.lastError}${classified?.kind === "auth" ? `; bridge cool-off ${this.coolOffMs / 1000}s` : ""}`)
          this.polling = false
          this.pollReady = false
          this.notifyChange()
          return
        }
        if (decision === "conflict") {
          this.conflictAttempts += 1
          const waitMs = telegramConflictRetryDelayMs(this.conflictAttempts)
          this.lastError = classified?.message || payload.description || "Telegram getUpdates conflict"
          writeLog("error", `Telegram polling conflict ${this.conflictAttempts} — waiting ${waitMs / 1000}s then dropping the other getUpdates session (Hermes/OpenClaw/desktop)`)
          this.notifyChange()
          await new Promise((resolve) => setTimeout(resolve, waitMs))
          if (!this.polling || generation !== this.pollGeneration) return
          try {
            await telegramRequest(`https://api.telegram.org/bot${token}/deleteWebhook`, {
              method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(telegramDeleteWebhookBody(true)),
            })
          } catch { /* best-effort session steal, same as Hermes start_polling(drop_pending_updates=True) */ }
          continue
        }
        if (decision === "backoff") {
          this.lastError = classified?.message || payload.description || "Telegram rate-limited"
          this.retryDelayMs = parseTelegramRetryAfterMs(payload, Math.min(this.retryDelayMs * 2, TelegramBridge.MAX_RETRY_DELAY_MS))
          writeLog("error", `Telegram polling rate-limited; waiting ${this.retryDelayMs / 1000}s`)
          await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs))
          continue
        }
        if (decision === "retry") {
          this.lastError = classified?.message || payload.description || "Telegram polling failed"
          this.retryDelayMs = Math.min(this.retryDelayMs * 2 + Math.floor(Math.random() * 1_000), TelegramBridge.MAX_RETRY_DELAY_MS)
          throw new Error(this.lastError)
        }
        this.retryDelayMs = 1_000
        this.conflictAttempts = 0
        this.consecutiveAuthFailures = 0
        this.coolOffUntil = 0
        this.lastPollAt = Date.now()
        this.lastError = ""
        for (const update of payload.result || []) {
          this.offset = Math.max(this.offset, update.update_id + 1)
          const chat = update.message?.chat || update.callback_query?.message?.chat
          const chatId = String(chat?.id || "")
          const text = update.message?.text?.trim() || update.callback_query?.data?.trim()
          if (update.callback_query) void this.answerCallback(update.callback_query.id)
          if (!chatId || !text || !chat) continue
          const mention = inboundMentionsBot({
            text,
            botUsername: this.lastUsername,
            botId: this.lastBotId || undefined,
            entities: update.message?.entities,
            replyFromId: update.message?.reply_to_message?.from?.id,
            replyFromIsBot: update.message?.reply_to_message?.from?.is_bot,
          })
          const inbound: TelegramInboundMeta = {
            messageId: update.message?.message_id || update.callback_query?.message?.message_id,
            chatType: chat.type,
            replyToBot: mention.replyToBot,
            mentionsBot: mention.mentionsBot,
          }
          if (!groupMessageShouldRun({
            chatType: chat.type,
            requireMention: this.agentOptions().requireMention,
            text,
            mentionsBot: inbound.mentionsBot,
            replyToBot: inbound.replyToBot,
            isCallback: Boolean(update.callback_query),
          })) continue
          const profile = profileFromTelegramChat(chat, text)
          this.rememberChat(profile)
          if (!this.allowedChats().includes(chatId)) {
            if (shouldAutoApproveFirst(this.allowedChats().length, this.autoApproveFirst())) {
              await this.addPendingChat(chatId, profile)
              await this.approveChat(chatId)
            } else {
              await this.addPendingChat(chatId, profile)
              const alreadyNotified = this.unauthorizedNotified.has(chatId)
              const route = routeUnauthorizedMessage(text, alreadyNotified)
              const pairing = pairingPublicReply({
                chatId,
                botUsername: this.lastUsername || undefined,
                label: labelChat(profile),
                command: publicPairingCommandName(text) || "start",
              })
              if (route === "whoami") {
                this.unauthorizedNotified.add(chatId)
                await this.sendLong(chatId, pairing)
              } else if (route === "public-handler") {
                if (!alreadyNotified) {
                  this.unauthorizedNotified.add(chatId)
                  await this.sendLong(chatId, pairing)
                }
                if (this.handler) void this.handleMessage(chatId, text, inbound)
              } else if (route === "cancel") {
                await this.sendLong(chatId, alreadyNotified
                  ? "Nothing to cancel until this chat is approved."
                  : `${pairing}\n\nNothing to cancel until this chat is approved.`)
                this.unauthorizedNotified.add(chatId)
              } else {
                this.unauthorizedNotified.add(chatId)
                await this.sendLong(chatId, route === "repeat-wait" ? stillWaitingMessage(chatId) : pairing)
              }
              continue
            }
          }
          if (!this.handler) { await this.send(chatId, "Grok Build Desktop is connected but its task handler is not ready."); continue }
          // Do not block polling while an agent task runs. This keeps callbacks,
          // /status, and especially /cancel responsive during long runs.
          void this.handleMessage(chatId, text, inbound)
        }
        if (payload.result?.length) await this.persistOffset()
      } catch (error) {
        if (!this.polling || generation !== this.pollGeneration) return
        if (error instanceof Error && /abort/i.test(error.message)) {
          if (telegramPollAbortShouldContinue(this.polling, generation === this.pollGeneration)) continue
          return
        }
        writeLog("error", `Telegram polling failed: ${error instanceof Error ? error.message : String(error)}`)
        // Sleep at least the current backoff window before retrying so a
        // sustained outage backs off rather than hammering Telegram.
        await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs))
      }
    }
  }

  private async handleMessage(chatId: string, text: string, meta?: TelegramInboundMeta): Promise<void> {
    try {
      writeLog("info", `Telegram command received from authorized chat ${chatId}: ${text.startsWith("/") ? text.split(/\s/, 1)[0] : "message"}`)
      const reply = await this.handler!(chatId, text, meta)
      const kind: TelegramSendKind = text === "approve_task" || text === "deny_task" || text.startsWith("/approve") || text.startsWith("/deny") ? "approval" : "final"
      if (typeof reply === "string") await this.sendLong(chatId, reply, kind)
      else await this.sendRich(chatId, reply, kind)
    } catch (error) {
      try {
        await this.sendLong(chatId, `Task failed: ${error instanceof Error ? error.message : String(error)}`)
      } catch (sendError) {
        writeLog("error", `Telegram failed to send a task error to ${chatId}: ${sendError instanceof Error ? sendError.message : String(sendError)}`)
      }
    }
  }

  private async configureCommands(): Promise<void> {
    const token = this.token()
    if (!token) return
    try {
      const response = await telegramPayload<{ ok: boolean; description?: string }>(`https://api.telegram.org/bot${token}/setMyCommands`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ commands: ESSENTIAL_BOT_COMMANDS }),
      })
      if (!response.ok) throw new Error(response.description || "Telegram rejected the command menu")
      this.commandMenuOk = true
      writeLog("info", "Telegram command menu registered")
    } catch (error) {
      this.commandMenuOk = false
      writeLog("error", `Telegram command-menu registration failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private async answerCallback(id: string): Promise<void> {
    const token = this.token(); if (!token) return
    try { await telegramPayload(`https://api.telegram.org/bot${token}/answerCallbackQuery`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ callback_query_id: id }) }) } catch { /* best effort */ }
  }

  private silentFlag(kind: TelegramSendKind): boolean {
    return shouldSilenceTelegramSend(kind, this.agentOptions().notifications)
  }

  private async sendRich(chatId: string, reply: TelegramReply, kind: TelegramSendKind = "final"): Promise<void> {
    const token = this.token(); if (!token) return
    const silent = this.silentFlag(kind)
    let payload = await telegramPayload<{ ok: boolean; description?: string }>(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chatId, text: telegramHtml(reply.text).slice(0, 4096), parse_mode: "HTML", link_preview_options: { is_disabled: true }, disable_notification: silent, reply_markup: telegramInlineKeyboard(reply) }),
    })
    if (!payload.ok && /parse|entity|too long/i.test(payload.description || "")) {
      payload = await telegramPayload<{ ok: boolean; description?: string }>(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chatId, text: reply.text.slice(0, 4096), disable_notification: silent, reply_markup: telegramInlineKeyboard(reply) }),
      })
    }
    if (!payload.ok) throw new Error(payload.description || "Telegram send failed")
  }

  async sendReply(chatId: string, reply: TelegramReply): Promise<void> { await this.sendRich(chatId, reply) }

  async sendActivity(chatId: string): Promise<void> {
    const token = this.token(); if (!token) return
    try {
      await telegramPayload(`https://api.telegram.org/bot${token}/sendChatAction`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chatId, action: "typing" }),
      })
    } catch { /* Activity is best-effort and must never fail a task. */ }
  }

  async sendProgress(chatId: string, text: string): Promise<number | undefined> {
    const token = this.token(); if (!token) return undefined
    try {
      const payload = await telegramPayload<{ ok: boolean; result?: { message_id: number } }>(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chatId, text: telegramHtml(text).slice(0, 4096), parse_mode: "HTML", link_preview_options: { is_disabled: true }, disable_notification: this.silentFlag("progress") }),
      })
      return payload.ok ? payload.result?.message_id : undefined
    } catch { return undefined }
  }

  async react(chatId: string, messageId: number, emoji: string): Promise<void> {
    const token = this.token(); if (!token || !messageId) return
    try {
      await telegramPayload(`https://api.telegram.org/bot${token}/setMessageReaction`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chatId, message_id: messageId, reaction: [{ type: "emoji", emoji }] }),
      })
    } catch { /* Reactions are best-effort visual feedback. */ }
  }

  async pinMessage(chatId: string, messageId: number): Promise<void> {
    const token = this.token(); if (!token || !messageId) return
    try {
      await telegramPayload(`https://api.telegram.org/bot${token}/pinChatMessage`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chatId, message_id: messageId, disable_notification: true }),
      })
    } catch { /* Pin is a visual turn indicator and must never fail a task. */ }
  }

  async unpinMessage(chatId: string, messageId: number): Promise<void> {
    const token = this.token(); if (!token || !messageId) return
    try {
      await telegramPayload(`https://api.telegram.org/bot${token}/unpinChatMessage`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chatId, message_id: messageId }),
      })
    } catch { /* Unpin is best-effort cleanup. */ }
  }

  async setPresence(online: boolean): Promise<void> {
    const token = this.token(); if (!token || !this.agentOptions().statusIndicator) return
    try {
      await telegramPayload(`https://api.telegram.org/bot${token}/setMyShortDescription`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ short_description: telegramPresenceText(online) }),
      })
    } catch { /* Profile presence is optional and must never block polling. */ }
  }

  async editProgress(chatId: string, messageId: number | undefined, text: string): Promise<void> {
    const token = this.token(); if (!token || !messageId) return
    try {
      await telegramPayload(`https://api.telegram.org/bot${token}/editMessageText`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chatId, message_id: messageId, text: telegramHtml(text).slice(0, 4096), parse_mode: "HTML", link_preview_options: { is_disabled: true } }),
      })
    } catch { /* Progress is best-effort and must never fail a task. */ }
  }

  async deleteProgress(chatId: string, messageId: number | undefined): Promise<void> {
    const token = this.token(); if (!token || !messageId) return
    try {
      await telegramPayload(`https://api.telegram.org/bot${token}/deleteMessage`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chatId, message_id: messageId }),
      })
    } catch { /* Progress cleanup is best-effort and must never hide a result. */ }
  }

  async send(chatId: string, text: string, kind: TelegramSendKind = "final"): Promise<{ ok: boolean; error?: string }> {
    const token = this.token()
    if (!token) return { ok: false, error: "Connect Telegram first" }
    if (!chatId.trim()) return { ok: false, error: "A Telegram chat ID is required" }
    if (!text.trim()) return { ok: false, error: "A message is required" }
    const silent = this.silentFlag(kind)
    try {
      let payload = await telegramPayload<{ ok: boolean; description?: string }>(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chatId.trim(), text: telegramHtml(text).slice(0, 4096), parse_mode: "HTML", link_preview_options: { is_disabled: true }, disable_notification: silent }),
      })
      if (!payload.ok && /parse|entity|too long/i.test(payload.description || "")) {
        payload = await telegramPayload<{ ok: boolean; description?: string }>(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chatId.trim(), text: text.slice(0, 4096), disable_notification: silent }),
        })
      }
      return payload.ok ? { ok: true } : { ok: false, error: payload.description || "Telegram send failed" }
    } catch (error) { return { ok: false, error: error instanceof Error ? error.message : String(error) } }
  }

  async sendLong(chatId: string, text: string, kind: TelegramSendKind = "final"): Promise<void> {
    for (const chunk of telegramTextChunks(text)) {
      const result = await this.send(chatId, chunk, kind)
      if (!result.ok) throw new Error(result.error || "Telegram send failed")
    }
  }
}
