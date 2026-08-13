/** Safe store slices when an older config file omitted a required key. */

export function storeArray<T>(value: T[] | undefined | null): T[] {
  return Array.isArray(value) ? value : []
}

export function storeTelegram(value: Record<string, unknown> | undefined | null): Record<string, unknown> {
  if (value && typeof value === "object") return value
  return { allowedChatIds: [], pendingChatIds: [] }
}

export function encryptedTelegramTokenPresent(telegram: { token?: string } | undefined | null): boolean {
  return Boolean(telegram?.token && String(telegram.token).trim())
}

export function telegramTokenFailureMessage(input: { hasEncrypted: boolean; encryptionAvailable: boolean; decrypted: boolean }): string {
  if (!input.hasEncrypted) return ""
  if (!input.encryptionAvailable) return "OS credential encryption is unavailable. Paste the bot token again after unlocking the keychain."
  if (!input.decrypted) return "Saved bot token cannot be decrypted in this app copy. Paste it again in Agent → Telegram."
  return ""
}
