/** Local Telegram Bot API bridge. Tokens are encrypted with Electron safeStorage. */
import { safeStorage } from "electron"
import { getStore } from "./store"
import { telegramInlineKeyboard, type TelegramReply } from "./telegram-format"
import { write as writeLog } from "./logging"
import { telegramHtml, telegramTextChunks } from "./telegram-text"
import { withDisconnectedState, withForgottenTokenState } from "./telegram-state.ts"

export type TelegramStatus = {
  connected: boolean
  polling?: boolean
  username?: string
  botId?: number
  error?: string
  /** Cooldown remaining before a retried connect attempt will be honoured. */
  coolOffMs?: number
}

export type TelegramResponse<T> = { status: number; payload: T }

async function telegramRequest<T>(url: string, init?: RequestInit): Promise<TelegramResponse<T>> {
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000), ...init })
  const payload = await response.json().catch(() => undefined) as T | undefined
  if (!payload) throw new Error(`Telegram returned an invalid response (${response.status})`)
  return { status: response.status, payload }
}

function telegramAuthError(status: number, description?: string): Error | undefined {
  if (status === 401 || status === 403) return new Error(`Telegram rejected the bot token (HTTP ${status}): ${description || "unauthorized"}. Polling paused — reconnect in Settings → Agent → Telegram.`)
  if (status === 429) return new Error(`Telegram rate-limited polling (HTTP 429): ${description || "too many requests"}. Polling paused — try again in a few minutes.`)
  return undefined
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
  private static readonly MAX_COOL_OFF_MS = 5 * 60_000
  private static readonly AUTH_FAILURE_WINDOW_MS = 10 * 60_000

  setMessageHandler(handler: (chatId: string, text: string) => Promise<string | TelegramReply>): void { this.handler = handler }

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
      return allowedChatIds
    })
  }

  /** Persisted mutation: drop a chat into the pending allow-list. */
  async addPendingChat(chatId: string): Promise<void> {
    return enqueueTelegramMutation(async () => {
      if (this.pendingChats().includes(chatId)) return
      getStore().set("telegram", { ...getStore().get("telegram"), pendingChatIds: [...this.pendingChats(), chatId] })
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

  async status(): Promise<TelegramStatus> {
    const token = this.token()
    if (!token) return { connected: false, coolOffMs: 0 }
    const coolOffRemaining = this.coolOffRemaining()
    try {
      const response = await telegramRequest<{ ok: boolean; result?: { id: number; username?: string }; description?: string }>(`https://api.telegram.org/bot${token}/getMe`)
      const authError = telegramAuthError(response.status, response.payload.description)
      if (authError) return { connected: false, error: authError.message, coolOffMs: coolOffRemaining }
      const payload = response.payload
      if (!payload.ok || !payload.result) return { connected: false, error: payload.description || "Telegram rejected the token", coolOffMs: coolOffRemaining }
      // Successful probe clears the breaker.
      this.coolOffUntil = 0
      this.consecutiveAuthFailures = 0
      return { connected: true, polling: this.polling, botId: payload.result.id, username: payload.result.username, coolOffMs: 0 }
    } catch (error) {
      return { connected: false, error: (error as Error).message, coolOffMs: coolOffRemaining }
    }
  }

  async connect(token: string): Promise<TelegramStatus> {
    if (this.coolOffRemaining() > 0) {
      return { connected: false, error: `Telegram cooling off for ${Math.ceil(this.coolOffRemaining() / 1000)}s after repeated auth failures. Try again then.`, coolOffMs: this.coolOffRemaining() }
    }
    if (!safeStorage.isEncryptionAvailable()) return { connected: false, error: "OS credential encryption is unavailable" }
    const clean = token.trim()
    if (!/^\d{6,}:[A-Za-z0-9_-]{20,}$/.test(clean)) return { connected: false, error: "That does not look like a Telegram BotFather token" }
    try {
      const response = await telegramRequest<{ ok: boolean; result?: { id: number; username?: string }; description?: string }>(`https://api.telegram.org/bot${clean}/getMe`)
      const authError = telegramAuthError(response.status, response.payload.description)
      if (authError) {
        this.recordAuthFailure()
        return { connected: false, error: authError.message, coolOffMs: this.coolOffRemaining() }
      }
      const payload = response.payload
      if (!payload.ok || !payload.result) {
        this.recordAuthFailure()
        return { connected: false, error: payload.description || "Telegram rejected the token", coolOffMs: this.coolOffRemaining() }
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
      this.start()
      return { connected: true, polling: this.polling, botId: payload.result.id, username: payload.result.username }
    } catch (error) {
      this.recordAuthFailure()
      return { connected: false, error: error instanceof Error ? error.message : String(error), coolOffMs: this.coolOffRemaining() }
    }
  }

  private recordAuthFailure(): void {
    this.consecutiveAuthFailures += 1
    // Tripled exponential backoff capped at 5 minutes; resets to 0 the
    // moment a successful probe / poll recovers.
    const { MAX_COOL_OFF_MS, AUTH_FAILURE_WINDOW_MS } = TelegramBridge
    const factor = Math.min(this.consecutiveAuthFailures, 6)
    this.coolOffMs = Math.min(MAX_COOL_OFF_MS, 5_000 * 2 ** factor)
    this.coolOffUntil = Date.now() + this.coolOffMs
    if (this.consecutiveAuthFailures > 3) {
      writeLog("error", `Telegram bridge entered ${this.coolOffMs / 1000}s cool-off after ${this.consecutiveAuthFailures} consecutive auth failures (window ${AUTH_FAILURE_WINDOW_MS / 1000}s)`)
    }
  }

  disconnect(): void {
    this.stop()
    // Soft disconnect: keep the encrypted token on disk so the user can
    // reconnect without re-entering the BotFather secret. Use
    // forgetToken() (or pass `{ forgetToken: true }` via the IPC) when the
    // user explicitly asks to remove the bot.
    void enqueueTelegramMutation(async () => {
      getStore().set("telegram", withDisconnectedState(getStore().get("telegram")))
    })
  }

  /**
   * Hard disconnect: drop the encrypted bot token from disk entirely.
   * Previously `disconnect()` left the token in place, which silently
   * contradicted the rest of the file's encryption posture and the user's
   * expectation when they clicked the Settings → Remove token control.
   */
  forgetToken(): void {
    this.stop()
    this.unauthorizedNotified.clear()
    this.coolOffUntil = 0
    this.consecutiveAuthFailures = 0
    void enqueueTelegramMutation(async () => {
      getStore().set("telegram", withForgottenTokenState(getStore().get("telegram")))
    })
  }

  start(): void {
    if (this.polling || !this.token()) return
    this.offset = Number(getStore().get("telegram").updateOffset) || 0
    this.polling = true
    const generation = ++this.pollGeneration
    void this.bootstrap(generation)
  }
  stop(): void { this.polling = false; this.pollGeneration++ }

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
      await this.configureCommands()
      writeLog("info", `Telegram polling started at update ${this.offset}`)
      await this.poll(generation)
    } catch (error) {
      if (!this.polling || generation !== this.pollGeneration) return
      writeLog("error", `Telegram bootstrap failed: ${error instanceof Error ? error.message : String(error)}`)
      this.polling = false
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
        const response = await telegramRequest<{ ok: boolean; result?: { update_id: number; message?: { text?: string; chat: { id: number } }; callback_query?: { id: string; data?: string; message?: { chat: { id: number } } } }[]; description?: string }>(`https://api.telegram.org/bot${token}/getUpdates?timeout=25&offset=${this.offset}`, { signal: AbortSignal.timeout(30_000) })
        // An invalid bot token returns HTTP 401/403; rate limiting returns 429.
        // Busily retrying every 2s hammers Telegram and never recovers on its
        // own. Hand the failure to the circuit breaker so a sustained outage
        // backs off instead of pinning the bridge into "stopped" with no UI
        // recovery path. The user can hit Connect again after the cool-off.
        const authError = telegramAuthError(response.status, response.payload.description)
        if (authError) {
          this.recordAuthFailure()
          writeLog("error", `Telegram polling paused: ${authError.message}; bridge cool-off ${this.coolOffMs / 1000}s`)
          this.polling = false
          return
        }
        const payload = response.payload
        if (!payload.ok) {
          // HTTP 429 is rate limiting; back off exponentially up to the cap
          // instead of sleeping a flat two seconds that would still trigger
          // the limiter on the next call. Track the failure so a sustained
          // 429 also engages the cool-off window.
          if (response.status === 429) {
            this.recordAuthFailure()
          } else {
            this.retryDelayMs = Math.min(this.retryDelayMs * 2 + Math.floor(Math.random() * 1_000), TelegramBridge.MAX_RETRY_DELAY_MS)
          }
          throw new Error(payload.description || "Telegram polling failed")
        }
        this.retryDelayMs = 1_000
        // A successful poll resets any breaker state so a recovered network
        // resumes at the configured fast-cadence polling rate.
        this.consecutiveAuthFailures = 0
        this.coolOffUntil = 0
        for (const update of payload.result || []) {
          this.offset = Math.max(this.offset, update.update_id + 1)
          const chatId = String(update.message?.chat.id || update.callback_query?.message?.chat.id || "")
          const text = update.message?.text?.trim() || update.callback_query?.data?.trim()
          if (update.callback_query) void this.answerCallback(update.callback_query.id)
          if (!chatId || !text) continue
          if (!this.allowedChats().includes(chatId)) {
            await this.addPendingChat(chatId)
            if (!this.unauthorizedNotified.has(chatId)) {
              this.unauthorizedNotified.add(chatId)
              await this.send(chatId, `Pairing required. Open Grok Build Desktop → Telegram and approve chat ${chatId}. The bot command menu is ready, but tasks stay blocked until you approve this chat.`)
            }
            continue
          }
          if (!this.handler) { await this.send(chatId, "Grok Build Desktop is connected but its task handler is not ready."); continue }
          // Do not block polling while an agent task runs. This keeps callbacks,
          // /status, and especially /cancel responsive during long runs.
          void this.handleMessage(chatId, text)
        }
        if (payload.result?.length) await this.persistOffset()
      } catch (error) {
        if (!this.polling || generation !== this.pollGeneration) return
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
      await this.send(chatId, `Task failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private async configureCommands(): Promise<void> {
    const token = this.token()
    if (!token) return
    try {
      const response = await telegramPayload<{ ok: boolean; description?: string }>(`https://api.telegram.org/bot${token}/setMyCommands`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ commands: [
          { command: "start", description: "Show setup and available commands" },
          { command: "help", description: "Show command help" },
          { command: "commands", description: "List all Telegram commands" },
          { command: "run", description: "Run a Grok Build task" },
          { command: "learn", description: "Draft a reusable skill" },
          { command: "goal", description: "Manage the persistent goal" },
          { command: "new", description: "Start a fresh agent session" },
          { command: "status", description: "Show backend and workspace status" },
          { command: "health", description: "Quick agent health check" },
          { command: "diagnostics", description: "Show local bridge diagnostics" },
          { command: "models", description: "List available models" },
          { command: "model", description: "Select a model" },
          { command: "project", description: "Choose a project" },
          { command: "mode", description: "Choose fast, balanced, or deep responses" },
          { command: "fast", description: "Toggle fast mode" },
          { command: "think", description: "Set session reasoning" },
          { command: "queue", description: "Show queued agent work" },
          { command: "tasks", description: "Show active and queued tasks" },
          { command: "steer", description: "Prioritize the next instruction" },
          { command: "interrupt", description: "Stop and redirect the active task" },
          { command: "retry", description: "Retry the previous instruction" },
          { command: "undo", description: "Rewind the previous completed turn" },
          { command: "compress", description: "Checkpoint and compact context" },
          { command: "reasoning", description: "Control reasoning for this session" },
          { command: "history", description: "Show recent conversation" },
          { command: "schedules", description: "Show scheduled agent work" },
          { command: "tools", description: "Show available agent tools" },
          { command: "skills", description: "List loaded skills" },
          { command: "skill", description: "Run a named skill" },
          { command: "login", description: "Start provider login" },
          { command: "whoami", description: "Show this chat id" },
          { command: "menu", description: "Open the control menu" },
          { command: "workspace", description: "Show the active workspace" },
          { command: "cancel", description: "Cancel the active task" },
          { command: "restart", description: "Restart the desktop agent" },
          { command: "session", description: "Show session settings" },
          { command: "usage", description: "Show recent usage" },
          { command: "context", description: "Show session context" },
          { command: "allowlist", description: "Show or edit allowed chats" },
          { command: "stop", description: "Stop the active task" },
          { command: "verbose", description: "Grok compatibility command" },
          { command: "trace", description: "Grok compatibility command" },
          { command: "elevated", description: "Grok compatibility command" },
          { command: "exec", description: "Grok compatibility command" },
          { command: "config", description: "Grok compatibility command" },
          { command: "mcp", description: "Grok compatibility command" },
          { command: "plugins", description: "Grok compatibility command" },
          { command: "subagents", description: "Grok compatibility command" },
          { command: "acp", description: "Grok compatibility command" },
          { command: "focus", description: "Grok compatibility command" },
          { command: "unfocus", description: "Grok compatibility command" },
          { command: "agents", description: "Grok compatibility command" },
          { command: "bash", description: "Grok compatibility command" },
        ] }),
      })
      if (!response.ok) throw new Error(response.description || "Telegram rejected the command menu")
      writeLog("info", "Telegram command menu registered: /learn, /goal, and compatibility commands")
    } catch (error) { writeLog("error", `Telegram command-menu registration failed: ${error instanceof Error ? error.message : String(error)}`) }
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
