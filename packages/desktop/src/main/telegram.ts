/** Local Telegram Bot API bridge. Tokens are encrypted with Electron safeStorage. */
import { safeStorage } from "electron"
import { getStore } from "./store"

export type TelegramStatus = { connected: boolean; username?: string; botId?: number; error?: string }

async function telegramRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000), ...init })
  const payload = await response.json().catch(() => undefined) as T | undefined
  if (!payload) throw new Error(`Telegram returned an invalid response (${response.status})`)
  return payload
}

export class TelegramBridge {
  private polling = false
  private offset = 0
  private handler?: (chatId: string, text: string) => Promise<string>
  private unauthorizedNotified = new Set<string>()

  setMessageHandler(handler: (chatId: string, text: string) => Promise<string>): void { this.handler = handler }
  allowedChats(): string[] { return getStore().get("telegram").allowedChatIds || [] }
  setAllowedChats(chatIds: string[]): string[] {
    const allowedChatIds = [...new Set(chatIds.map((id) => id.trim()).filter((id) => /^-?\d+$/.test(id)))]
    getStore().set("telegram", { ...getStore().get("telegram"), allowedChatIds })
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

  disconnect(): void { this.stop(); getStore().set("telegram", { allowedChatIds: this.allowedChats() }) }

  start(): void {
    if (this.polling || !this.token()) return
    this.polling = true
    void this.poll()
  }
  stop(): void { this.polling = false }

  private async poll(): Promise<void> {
    while (this.polling) {
      try {
        const token = this.token()
        if (!token) return
        const payload = await telegramRequest<{ ok: boolean; result?: { update_id: number; message?: { text?: string; chat: { id: number } } }[]; description?: string }>(`https://api.telegram.org/bot${token}/getUpdates?timeout=25&offset=${this.offset}`, { signal: AbortSignal.timeout(30_000) })
        if (!payload.ok) throw new Error(payload.description || "Telegram polling failed")
        for (const update of payload.result || []) {
          this.offset = Math.max(this.offset, update.update_id + 1)
          const chatId = String(update.message?.chat.id || "")
          const text = update.message?.text?.trim()
          if (!chatId || !text) continue
          if (!this.allowedChats().includes(chatId)) {
            if (!this.unauthorizedNotified.has(chatId)) {
              this.unauthorizedNotified.add(chatId)
              await this.send(chatId, `This chat is not authorized. Add chat ID ${chatId} to Grok Build Desktop → Telegram.`)
            }
            continue
          }
          if (!this.handler) { await this.send(chatId, "Grok Build Desktop is connected but its task handler is not ready."); continue }
          try { await this.send(chatId, await this.handler(chatId, text)) }
          catch (error) { await this.send(chatId, `Task failed: ${error instanceof Error ? error.message : String(error)}`) }
        }
      } catch (error) {
        if (!this.polling) return
        await new Promise((resolve) => setTimeout(resolve, 2_000))
      }
    }
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
