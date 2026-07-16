export type TelegramReply = { text: string; buttons?: { text: string; data: string }[][] }

/** Convert the app's provider-neutral buttons to Telegram Bot API buttons. */
export function telegramInlineKeyboard(reply: TelegramReply): { inline_keyboard: { text: string; callback_data: string }[][] } | undefined {
  const rows = (reply.buttons || [])
    .map((row) => row
      .filter((button) => button.text.trim() && button.data.trim())
      .map((button) => {
        const callbackData = Buffer.from(button.data, "utf8")
        if (callbackData.byteLength > 64) throw new Error("Telegram callback data cannot exceed 64 bytes")
        return { text: button.text.slice(0, 64), callback_data: button.data }
      }))
    .filter((row) => row.length)
  return rows.length ? { inline_keyboard: rows } : undefined
}
