/** Return only the model's public answer for Telegram delivery. */
export function publicTelegramResponse(raw: string): string {
  let text = raw
  // Providers do not all classify reasoning events consistently. Treat their
  // structured reasoning envelopes as private even when they arrive as text.
  text = text.replace(/<(think|thinking|analysis|reasoning)>[\s\S]*?<\/\1>/gi, "")
  text = text.replace(/<(think|thinking|analysis|reasoning)>[\s\S]*$/gi, "")
  text = text.replace(/<\/(?:think|thinking|analysis|reasoning)>/gi, "")
  text = text.replace(/<app_action>[\s\S]*?<\/app_action>/gi, "")
  text = text.replace(/<\|channel\|>\s*(?:analysis|commentary)[\s\S]*?(?=<\|channel\|>\s*final|$)/gi, "")
  text = text.replace(/<\|channel\|>\s*final/gi, "")
  return text.replace(/\n{3,}/g, "\n\n").trim()
}

/** Extract assistant text from Grok headless text events and compatible
 * provider wrappers that call the field content, message, or text. */
export function telegramEventText(event: Record<string, unknown>): string {
  if (event.type === "text" && typeof event.data === "string") return event.data
  if (!/assistant|message|content|final|result/i.test(String(event.type || ""))) return ""
  for (const key of ["text", "content", "message", "data", "output"]) {
    const value = event[key]
    if (typeof value === "string" && value.trim()) return value
    if (value && typeof value === "object") {
      const nested = value as Record<string, unknown>
      for (const nestedKey of ["text", "content", "message"]) {
        if (typeof nested[nestedKey] === "string" && nested[nestedKey].trim()) return nested[nestedKey] as string
      }
    }
  }
  return ""
}
