/** Local Telegram Bot API bridge. Tokens are encrypted with Electron safeStorage. */
import { safeStorage } from "electron"
import { getStore } from "./store"
import { telegramInlineKeyboard, type TelegramReply } from "./telegram-format"
import { write as writeLog } from "./logging"
import { telegramHtml, telegramTextChunks } from "./telegram-text"

export type TelegramStatus = { connected: boolean; polling?: boolean; username?: string; botId?: number; error?: string }

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

export class TelegramBridge {
  private polling = false
  private pollGeneration = 0
  private offset = 0
  private handler?: (chatId: string, text: string) => Promise<string | TelegramReply>
  private unauthorizedNotified = new Set<string>()

  setMessageHandler(handler: (chatId: string, text: string) => Promise<string | TelegramReply>): void { this.handler = handler }
  allowedChats(): string[] { return getStore().get("telegram").allowedChatIds || [] }
  pendingChats(): string[] { return getStore().get("telegram").pendingChatIds || [] }
  setAllowedChats(chatIds: string[]): string[] {
    const allowedChatIds = [...new Set(chatIds.map((id) => id.trim()).filter((id) => /^-?\d+$/.test(id)))]
    getStore().set("telegram", { ...getStore().get("telegram"), allowedChatIds, pendingChatIds: this.pendingChats().filter((id) => !allowedChatIds.includes(id)) })
    for (const id of allowedChatIds) this.unauthorizedNotified.delete(id)
    return allowedChatIds
  }
  private token(): string | undefined {
    const encrypted = getStore().get("telegram").token
    if (!encrypted || !safeStorage.isEncryptionAvailable()) return undefined
    try { return safeStorage.decryptString(Buffer.from(encrypted, "base64")) }
    catch { return undefined }
  }

  async status(): Promise<TelegramStatus> {
    const token = this.token()
    if (!token) return { connected: false }
    try {
      const response = await telegramRequest<{ ok: boolean; result?: { id: number; username?: string }; description?: string }>(`https://api.telegram.org/bot${token}/getMe`)
      const authError = telegramAuthError(response.status, response.payload.description)
      if (authError) return { connected: false, error: authError.message }
      const payload = response.payload
      if (!payload.ok || !payload.result) return { connected: false, error: payload.description || "Telegram rejected the token" }
      return { connected: true, polling: this.polling, botId: payload.result.id, username: payload.result.username }
    } catch (error) { return { connected: false, error: (error as Error).message } }
  }

  async connect(token: string): Promise<TelegramStatus> {
    if (!safeStorage.isEncryptionAvailable()) return { connected: false, error: "OS credential encryption is unavailable" }
    const clean = token.trim()
    if (!/^\d{6,}:[A-Za-z0-9_-]{20,}$/.test(clean)) return { connected: false, error: "That does not look like a Telegram BotFather token" }
    try {
      const response = await telegramRequest<{ ok: boolean; result?: { id: number; username?: string }; description?: string }>(`https://api.telegram.org/bot${clean}/getMe`)
      const authError = telegramAuthError(response.status, response.payload.description)
      if (authError) return { connected: false, error: authError.message }
      const payload = response.payload
      if (!payload.ok || !payload.result) return { connected: false, error: payload.description || "Telegram rejected the token" }
      this.offset = 0
      getStore().set("telegram", { ...getStore().get("telegram"), token: safeStorage.encryptString(clean).toString("base64"), updateOffset: 0 })
      this.start()
      return { connected: true, polling: this.polling, botId: payload.result.id, username: payload.result.username }
    } catch (error) { return { connected: false, error: error instanceof Error ? error.message : String(error) } }
  }

  disconnect(): void {
    this.stop()
    const current = getStore().get("telegram")
    getStore().set("telegram", { allowedChatIds: this.allowedChats(), pendingChatIds: this.pendingChats(), updateOffset: this.offset, sessions: current.sessions })
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
        const response = await telegramRequest<{ ok: boolean; result?: { update_id: number; message?: { text?: string; chat: { id: number } }; callback_query?: { id: string; data?: string; message?: { chat: { id: number } } } }[]; description?: string }>(`https://api.telegram.org/bot${token}/getUpdates?timeout=25&offset=${this.offset}`, { signal: AbortSignal.timeout(30_000) })
        // An invalid bot token returns HTTP 401/403; rate limiting returns 429.
        // Busily retrying every 2s hammers Telegram and never recovers on its
        // own. Pause polling and surface the error so the user can re-connect.
        const authError = telegramAuthError(response.status, response.payload.description)
        if (authError) { writeLog("error", `Telegram polling paused: ${authError.message}`); this.polling = false; return }
        const payload = response.payload
        if (!payload.ok) throw new Error(payload.description || "Telegram polling failed")
        for (const update of payload.result || []) {
          this.offset = Math.max(this.offset, update.update_id + 1)
          const chatId = String(update.message?.chat.id || update.callback_query?.message?.chat.id || "")
          const text = update.message?.text?.trim() || update.callback_query?.data?.trim()
          if (update.callback_query) void this.answerCallback(update.callback_query.id)
          if (!chatId || !text) continue
          if (!this.allowedChats().includes(chatId)) {
            if (!this.pendingChats().includes(chatId)) getStore().set("telegram", { ...getStore().get("telegram"), pendingChatIds: [...this.pendingChats(), chatId] })
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
        if (payload.result?.length) getStore().set("telegram", { ...getStore().get("telegram"), updateOffset: this.offset })
      } catch (error) {
        if (!this.polling || generation !== this.pollGeneration) return
        writeLog("error", `Telegram polling failed: ${error instanceof Error ? error.message : String(error)}`)
        await new Promise((resolve) => setTimeout(resolve, 2_000))
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
      await telegramPayload(`https://api.telegram.org/bot${token}/setMyCommands`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ commands: [
          { command: "start", description: "Show setup and available commands" },
          { command: "help", description: "Show command help" },
          { command: "run", description: "Run a Grok Build task" },
          { command: "new", description: "Start a fresh agent session" },
          { command: "status", description: "Show backend and workspace status" },
          { command: "health", description: "Quick agent health check" },
          { command: "models", description: "List available models" },
          { command: "model", description: "Select a model" },
          { command: "project", description: "Choose a project" },
          { command: "mode", description: "Choose fast, balanced, or deep responses" },
          { command: "queue", description: "Show queued agent work" },
          { command: "steer", description: "Prioritize the next instruction" },
          { command: "interrupt", description: "Stop and redirect the active task" },
          { command: "retry", description: "Retry the previous instruction" },
          { command: "undo", description: "Rewind the previous completed turn" },
          { command: "compress", description: "Checkpoint and compact context" },
          { command: "reasoning", description: "Control reasoning for this session" },
          { command: "history", description: "Show recent conversation" },
          { command: "schedules", description: "Show scheduled agent work" },
          { command: "menu", description: "Open the control menu" },
          { command: "workspace", description: "Show the active workspace" },
          { command: "cancel", description: "Cancel the active task" },
          { command: "restart", description: "Restart the desktop agent" },
        ] }),
      })
    } catch { /* Command-menu setup is retried on the next app start. */ }
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
