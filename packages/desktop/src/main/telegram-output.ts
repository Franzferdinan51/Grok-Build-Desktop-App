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
