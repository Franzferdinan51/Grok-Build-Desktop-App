/** Local Telegram Bot API bridge. Tokens are encrypted with Electron safeStorage. */
import { safeStorage } from "electron"
import { getStore } from "./store"

export type TelegramStatus = { connected: boolean; username?: string; botId?: number; error?: string }

export class TelegramBridge {
  private token(): string | undefined {
    const encrypted = getStore().get("telegram").token
    if (!encrypted || !safeStorage.isEncryptionAvailable()) return undefined
    return safeStorage.decryptString(Buffer.from(encrypted, "base64"))
  }

  async status(): Promise<TelegramStatus> {
    const token = this.token()
    if (!token) return { connected: false }
    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/getMe`)
      const payload = await response.json() as { ok: boolean; result?: { id: number; username?: string }; description?: string }
      if (!payload.ok || !payload.result) return { connected: false, error: payload.description || "Telegram rejected the token" }
      return { connected: true, botId: payload.result.id, username: payload.result.username }
    } catch (error) { return { connected: false, error: (error as Error).message } }
  }

  async connect(token: string): Promise<TelegramStatus> {
    if (!safeStorage.isEncryptionAvailable()) return { connected: false, error: "OS credential encryption is unavailable" }
    const clean = token.trim()
    const response = await fetch(`https://api.telegram.org/bot${clean}/getMe`)
    const payload = await response.json() as { ok: boolean; result?: { id: number; username?: string }; description?: string }
    if (!payload.ok || !payload.result) return { connected: false, error: payload.description || "Telegram rejected the token" }
    getStore().set("telegram", { token: safeStorage.encryptString(clean).toString("base64") })
    return { connected: true, botId: payload.result.id, username: payload.result.username }
  }

  disconnect(): void { getStore().set("telegram", {}) }

  async send(chatId: string, text: string): Promise<{ ok: boolean; error?: string }> {
    const token = this.token()
    if (!token) return { ok: false, error: "Connect Telegram first" }
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chatId, text }),
    })
    const payload = await response.json() as { ok: boolean; description?: string }
    return payload.ok ? { ok: true } : { ok: false, error: payload.description || "Telegram send failed" }
  }
}
