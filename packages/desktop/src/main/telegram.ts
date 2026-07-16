/** Local Telegram Bot API bridge. Tokens are encrypted with Electron safeStorage. */
import { safeStorage } from "electron"
import { getStore } from "./store"

export type TelegramStatus = { connected: boolean; username?: string; botId?: number; error?: string }
export type TelegramReply = { text: string; buttons?: { text: string; data: string }[][] }

async function telegramRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000), ...init })
  const payload = await response.json().catch(() => undefined) as T | undefined
  if (!payload) throw new Error(`Telegram returned an invalid response (${response.status})`)
  return payload
}

export class TelegramBridge {
  private polling = false
  private offset = 0
  private handler?: (chatId: string, text: string) => Promise<string | TelegramReply>
  private unauthorizedNotified = new Set<string>()

  setMessageHandler(handler: (chatId: string, text: string) => Promise<string | TelegramReply>): void { this.handler = handler }
  allowedChats(): string[] { return getStore().get("telegram").allowedChatIds || [] }
  pendingChats(): string[] { return getStore().get("telegram").pendingChatIds || [] }
  setAllowedChats(chatIds: string[]): string[] {
    const allowedChatIds = [...new Set(chatIds.map((id) => id.trim()).filter((id) => /^-?\d+$/.test(id)))]
    getStore().set("telegram", { ...getStore().get("telegram"), allowedChatIds, pendingChatIds: this.pendingChats().filter((id) => !allowedChatIds.includes(id)) })
    return allowedChatIds
  }
  private token(): string | undefined {
    const encrypted = getStore().get("telegram").token
    if (!encrypted || !safeStorage.isEncryptionAvailable()) return undefined
    return safeStorage.decryptString(Buffer.from(encrypted, "base64"))
  }

  async status(): Promise<TelegramStatus> {
    const token = this.token()
    if (!token) return { connected: false }
    try {
      const payload = await telegramRequest<{ ok: boolean; result?: { id: number; username?: string }; description?: string }>(`https://api.telegram.org/bot${token}/getMe`)
      if (!payload.ok || !payload.result) return { connected: false, error: payload.description || "Telegram rejected the token" }
      return { connected: true, botId: payload.result.id, username: payload.result.username }
    } catch (error) { return { connected: false, error: (error as Error).message } }
  }

  async connect(token: string): Promise<TelegramStatus> {
    if (!safeStorage.isEncryptionAvailable()) return { connected: false, error: "OS credential encryption is unavailable" }
    const clean = token.trim()
    if (!/^\d{6,}:[A-Za-z0-9_-]{20,}$/.test(clean)) return { connected: false, error: "That does not look like a Telegram BotFather token" }
    try {
      const payload = await telegramRequest<{ ok: boolean; result?: { id: number; username?: string }; description?: string }>(`https://api.telegram.org/bot${clean}/getMe`)
      if (!payload.ok || !payload.result) return { connected: false, error: payload.description || "Telegram rejected the token" }
      getStore().set("telegram", { ...getStore().get("telegram"), token: safeStorage.encryptString(clean).toString("base64") })
      this.start()
      return { connected: true, botId: payload.result.id, username: payload.result.username }
    } catch (error) { return { connected: false, error: error instanceof Error ? error.message : String(error) } }
  }

  disconnect(): void { this.stop(); getStore().set("telegram", { allowedChatIds: this.allowedChats(), pendingChatIds: this.pendingChats() }) }

  start(): void {
    if (this.polling || !this.token()) return
    this.polling = true
    void this.configureCommands()
    void this.poll()
  }
  stop(): void { this.polling = false }

  private async poll(): Promise<void> {
    while (this.polling) {
      try {
        const token = this.token()
        if (!token) return
        const payload = await telegramRequest<{ ok: boolean; result?: { update_id: number; message?: { text?: string; chat: { id: number } }; callback_query?: { id: string; data?: string; message?: { chat: { id: number } } } }[]; description?: string }>(`https://api.telegram.org/bot${token}/getUpdates?timeout=25&offset=${this.offset}`, { signal: AbortSignal.timeout(30_000) })
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
          try {
            const reply = await this.handler(chatId, text)
            if (typeof reply === "string") await this.send(chatId, reply)
            else await this.sendRich(chatId, reply)
          }
          catch (error) { await this.send(chatId, `Task failed: ${error instanceof Error ? error.message : String(error)}`) }
        }
      } catch (error) {
        if (!this.polling) return
        await new Promise((resolve) => setTimeout(resolve, 2_000))
      }
    }
  }

  private async configureCommands(): Promise<void> {
    const token = this.token()
    if (!token) return
    try {
      await telegramRequest(`https://api.telegram.org/bot${token}/setMyCommands`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ commands: [
          { command: "start", description: "Show setup and available commands" },
          { command: "help", description: "Show command help" },
          { command: "run", description: "Run a Grok Build task" },
          { command: "status", description: "Show backend and workspace status" },
          { command: "models", description: "List available models" },
          { command: "model", description: "Select a model" },
          { command: "projects", description: "Choose a project" },
          { command: "menu", description: "Open the control menu" },
          { command: "workspace", description: "Show the active workspace" },
          { command: "cancel", description: "Cancel the active task" },
        ] }),
      })
    } catch { /* Command-menu setup is retried on the next app start. */ }
  }

  private async answerCallback(id: string): Promise<void> {
    const token = this.token(); if (!token) return
    try { await telegramRequest(`https://api.telegram.org/bot${token}/answerCallbackQuery`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ callback_query_id: id }) }) } catch { /* best effort */ }
  }

  private async sendRich(chatId: string, reply: TelegramReply): Promise<void> {
    const token = this.token(); if (!token) return
    const payload = await telegramRequest<{ ok: boolean; description?: string }>(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chatId, text: reply.text.slice(0, 4096), reply_markup: reply.buttons?.length ? { inline_keyboard: reply.buttons } : undefined }),
    })
    if (!payload.ok) throw new Error(payload.description || "Telegram send failed")
  }

  async send(chatId: string, text: string): Promise<{ ok: boolean; error?: string }> {
    const token = this.token()
    if (!token) return { ok: false, error: "Connect Telegram first" }
    if (!chatId.trim()) return { ok: false, error: "A Telegram chat ID is required" }
    if (!text.trim()) return { ok: false, error: "A message is required" }
    try {
      const payload = await telegramRequest<{ ok: boolean; description?: string }>(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chatId.trim(), text: text.slice(0, 4096) }),
      })
      return payload.ok ? { ok: true } : { ok: false, error: payload.description || "Telegram send failed" }
    } catch (error) { return { ok: false, error: error instanceof Error ? error.message : String(error) } }
  }
}
