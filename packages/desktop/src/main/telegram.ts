/** Local Telegram Bot API bridge. Tokens are encrypted with Electron safeStorage. */
import { safeStorage } from "electron"
import { getStore } from "./store"
import { telegramInlineKeyboard, type TelegramReply } from "./telegram-format"
import { write as writeLog } from "./logging"
import { telegramHtml, telegramTextChunks } from "./telegram-text"
import { withDisconnectedState, withForgottenTokenState } from "./telegram-state.ts"
import {
  ESSENTIAL_BOT_COMMANDS,
  approveChatState,
  approvedMessage,
  classifyTelegramHttpError,
  denyChatState,
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
  private pollGeneration = 0
  private offset = 0
  private handler?: (chatId: string, text: string) => Promise<string | TelegramReply>
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
  private pollAbort?: AbortController
  private changeListeners = new Set<() => void>()

  setMessageHandler(handler: (chatId: string, text: string) => Promise<string | TelegramReply>): void { this.handler = handler }

  onChange(listener: () => void): () => void {
    this.changeListeners.add(listener)
    return () => { this.changeListeners.delete(listener) }
  }

  private notifyChange(): void {
    for (const listener of this.changeListeners) {
      try { listener() } catch { /* renderer listeners must never break the bridge */ }
    }
  }

  allowedChats(): string[] { return getStore().get("telegram").allowedChatIds || [] }
  pendingChats(): string[] { return getStore().get("telegram").pendingChatIds || [] }

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
    this.start()
    return this.status({ probe: false })
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

  private token(): string | undefined {
    const encrypted = getStore().get("telegram").token
    if (!encrypted || !safeStorage.isEncryptionAvailable()) return undefined
    try { return safeStorage.decryptString(Buffer.from(encrypted, "base64")) }
    catch { return undefined }
  }

  private snapshot(partial: Partial<TelegramStatus> = {}): TelegramStatus {
    return {
      connected: false,
      hasToken: Boolean(this.token()),
      polling: this.polling,
      firstName: this.botFirstName || undefined,
      lastPollAt: this.lastPollAt || undefined,
      lastError: this.lastError || undefined,
      webhookCleared: this.webhookCleared,
      commandMenuOk: this.commandMenuOk,
      allowedCount: this.allowedChats().length,
      pendingCount: this.pendingChats().length,
      autoApproveFirst: Boolean(getStore().get("telegram").autoApproveFirst),
      coolOffMs: this.coolOffRemaining(),
      ...partial,
    }
  }

  async status(options: { probe?: boolean } = {}): Promise<TelegramStatus> {
    const token = this.token()
    if (!token) return this.snapshot({ connected: false, hasToken: false, coolOffMs: 0 })
    const coolOffRemaining = this.coolOffRemaining()
    // Live long-poll is the source of truth. Do not call getMe on the UI
    // refresh timer — that 4s hammer is what 429s the bot and then the
    // old probe reported "disconnected" while getUpdates was still running.
    if (this.polling && !options.probe) {
      return this.snapshot({
        connected: true,
        hasToken: true,
        polling: true,
        botId: this.lastBotId || undefined,
        username: this.lastUsername || undefined,
        firstName: this.botFirstName || undefined,
        coolOffMs: coolOffRemaining,
        error: this.lastError || undefined,
      })
    }
    if (!options.probe && this.lastProbeAt && Date.now() - this.lastProbeAt < 60_000) {
      return this.snapshot({
        connected: this.polling || Boolean(this.lastUsername),
        hasToken: true,
        polling: this.polling,
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
          connected: this.polling || Boolean(this.lastUsername),
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
          connected: this.polling,
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
        connected: true,
        polling: this.polling,
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
        connected: this.polling || Boolean(this.lastUsername),
        error: this.polling ? this.lastError || message : message,
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
    if (!/^\d{6,}:[A-Za-z0-9_-]{20,}$/.test(clean)) return { connected: false, error: "That does not look like a Telegram BotFather token" }
    try {
      const response = await telegramRequest<{ ok: boolean; result?: { id: number; username?: string; first_name?: string }; description?: string }>(`https://api.telegram.org/bot${clean}/getMe`)
      const authError = telegramAuthError(response.status, response.payload.description)
      if (authError) {
        this.recordAuthFailure()
        this.lastError = authError.message
        return this.snapshot({ connected: false, error: authError.message })
      }
      const payload = response.payload
      if (!payload.ok || !payload.result) {
        this.recordAuthFailure()
        const error = payload.description || "Telegram rejected the token"
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
      this.botFirstName = payload.result.first_name || ""
      this.lastUsername = payload.result.username || ""
      this.lastBotId = payload.result.id
      this.lastProbeAt = Date.now()
      this.lastError = ""
      this.start()
      this.notifyChange()
      return this.snapshot({ connected: true, polling: this.polling, botId: payload.result.id, username: payload.result.username, firstName: payload.result.first_name, coolOffMs: 0 })
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
    if (this.polling || !this.token()) return
    this.offset = Number(getStore().get("telegram").updateOffset) || 0
    this.polling = true
    const generation = ++this.pollGeneration
    void this.bootstrap(generation)
  }
  stop(): void {
    this.polling = false
    this.pollGeneration++
    this.pollAbort?.abort()
    this.pollAbort = undefined
  }

  private async bootstrap(generation: number): Promise<void> {
    const token = this.token()
    if (!token || !this.polling || generation !== this.pollGeneration) return
    try {
      // Telegram rejects getUpdates while a webhook is configured. A token
      // connected to this desktop app explicitly opts into local long polling,
      // so remove stale webhook configuration without dropping queued updates.
      const payload = await telegramPayload<{ ok: boolean; description?: string }>(`https://api.telegram.org/bot${token}/deleteWebhook`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ drop_pending_updates: false }),
      })
      if (!payload.ok) throw new Error(payload.description || "Could not clear Telegram webhook")
      this.webhookCleared = true
      this.lastError = ""
      await this.configureCommands()
      writeLog("info", `Telegram polling started at update ${this.offset}`)
      await this.poll(generation)
    } catch (error) {
      if (!this.polling || generation !== this.pollGeneration) return
      this.lastError = error instanceof Error ? error.message : String(error)
      writeLog("error", `Telegram bootstrap failed: ${this.lastError}`)
      this.retryDelayMs = Math.min(this.retryDelayMs * 2 + Math.floor(Math.random() * 1_000), TelegramBridge.MAX_RETRY_DELAY_MS)
      await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs))
      if (this.polling && generation === this.pollGeneration) await this.bootstrap(generation)
    }
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
        const timeout = setTimeout(() => pollAbort.abort(), 30_000)
        let response: TelegramResponse<{ ok: boolean; result?: { update_id: number; message?: { text?: string; chat: { id: number; type?: string; title?: string; username?: string; first_name?: string; last_name?: string } }; callback_query?: { id: string; data?: string; message?: { chat: { id: number; type?: string; title?: string; username?: string; first_name?: string; last_name?: string } } } }[]; description?: string }>
        try {
          response = await telegramRequest(`https://api.telegram.org/bot${token}/getUpdates?timeout=25&offset=${this.offset}`, { signal: pollAbort.signal })
        } finally {
          clearTimeout(timeout)
        }
        // An invalid bot token returns HTTP 401/403; rate limiting returns 429.
        // Busily retrying every 2s hammers Telegram and never recovers on its
        // own. Hand the failure to the circuit breaker so a sustained outage
        // backs off instead of pinning the bridge into "stopped" with no UI
        // recovery path. The user can hit Connect again after the cool-off.
        const classified = classifyTelegramHttpError(response.status, response.payload.description)
        if (classified?.kind === "auth") {
          this.recordAuthFailure()
          this.lastError = classified.message
          writeLog("error", `Telegram polling paused: ${classified.message}; bridge cool-off ${this.coolOffMs / 1000}s`)
          this.polling = false
          this.notifyChange()
          return
        }
        const payload = response.payload
        if (classified?.kind === "rate") {
          this.lastError = classified.message
          this.retryDelayMs = parseTelegramRetryAfterMs(payload, Math.min(this.retryDelayMs * 2, TelegramBridge.MAX_RETRY_DELAY_MS))
          writeLog("error", `Telegram polling rate-limited; waiting ${this.retryDelayMs / 1000}s`)
          await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs))
          continue
        }
        if (!payload.ok || classified?.kind === "conflict") {
          this.lastError = classified?.message || payload.description || "Telegram polling failed"
          this.retryDelayMs = Math.min(this.retryDelayMs * 2 + Math.floor(Math.random() * 1_000), TelegramBridge.MAX_RETRY_DELAY_MS)
          throw new Error(this.lastError)
        }
        this.retryDelayMs = 1_000
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
                if (this.handler) void this.handleMessage(chatId, text)
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
          void this.handleMessage(chatId, text)
        }
        if (payload.result?.length) await this.persistOffset()
      } catch (error) {
        if (!this.polling || generation !== this.pollGeneration) return
        if (error instanceof Error && /abort/i.test(error.message)) return
        writeLog("error", `Telegram polling failed: ${error instanceof Error ? error.message : String(error)}`)
        // Sleep at least the current backoff window before retrying so a
        // sustained outage backs off rather than hammering Telegram.
        await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs))
      }
    }
  }

  private async handleMessage(chatId: string, text: string): Promise<void> {
    try {
      writeLog("info", `Telegram command received from authorized chat ${chatId}: ${text.startsWith("/") ? text.split(/\s/, 1)[0] : "message"}`)
      const reply = await this.handler!(chatId, text)
      if (typeof reply === "string") await this.sendLong(chatId, reply)
      else await this.sendRich(chatId, reply)
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

  private async sendRich(chatId: string, reply: TelegramReply): Promise<void> {
    const token = this.token(); if (!token) return
    let payload = await telegramPayload<{ ok: boolean; description?: string }>(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chatId, text: telegramHtml(reply.text).slice(0, 4096), parse_mode: "HTML", link_preview_options: { is_disabled: true }, reply_markup: telegramInlineKeyboard(reply) }),
    })
    if (!payload.ok && /parse|entity|too long/i.test(payload.description || "")) {
      payload = await telegramPayload<{ ok: boolean; description?: string }>(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chatId, text: reply.text.slice(0, 4096), reply_markup: telegramInlineKeyboard(reply) }),
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
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chatId, text: telegramHtml(text).slice(0, 4096), parse_mode: "HTML", link_preview_options: { is_disabled: true } }),
      })
      return payload.ok ? payload.result?.message_id : undefined
    } catch { return undefined }
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

  async send(chatId: string, text: string): Promise<{ ok: boolean; error?: string }> {
    const token = this.token()
    if (!token) return { ok: false, error: "Connect Telegram first" }
    if (!chatId.trim()) return { ok: false, error: "A Telegram chat ID is required" }
    if (!text.trim()) return { ok: false, error: "A message is required" }
    try {
      let payload = await telegramPayload<{ ok: boolean; description?: string }>(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chatId.trim(), text: telegramHtml(text).slice(0, 4096), parse_mode: "HTML", link_preview_options: { is_disabled: true } }),
      })
      if (!payload.ok && /parse|entity|too long/i.test(payload.description || "")) {
        payload = await telegramPayload<{ ok: boolean; description?: string }>(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chatId.trim(), text: text.slice(0, 4096) }),
        })
      }
      return payload.ok ? { ok: true } : { ok: false, error: payload.description || "Telegram send failed" }
    } catch (error) { return { ok: false, error: error instanceof Error ? error.message : String(error) } }
  }

  async sendLong(chatId: string, text: string): Promise<void> {
    for (const chunk of telegramTextChunks(text)) {
      const result = await this.send(chatId, chunk)
      if (!result.ok) throw new Error(result.error || "Telegram send failed")
    }
  }
}
