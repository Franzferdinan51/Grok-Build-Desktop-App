export function telegramTextChunks(text: string, limit = 3000): string[] {
  const chunks: string[] = []
  let remaining = text.trim()
  while (remaining.length > limit) {
    let split = remaining.lastIndexOf("\n", limit)
    if (split < Math.min(1000, limit / 2)) split = remaining.lastIndexOf(" ", limit)
    if (split < Math.min(1000, limit / 2)) split = limit
    chunks.push(remaining.slice(0, split).trimEnd())
    remaining = remaining.slice(split).trimStart()
  }
  if (remaining) chunks.push(remaining)
  return chunks
}

/** Render the useful Markdown subset supported by Telegram's HTML mode. */
export function telegramHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
  return escaped
    .replace(/```(?:[\w.+-]+)?\n([\s\S]*?)```/g, "<pre><code>$1</code></pre>")
    .replace(/`([^`\n]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>")
    .replace(/__([^_\n]+)__/g, "<b>$1</b>")
    .replace(/~~([^~\n]+)~~/g, "<s>$1</s>")
    .replace(/(^|\s)\*([^*\n]+)\*(?=\s|$)/g, "$1<i>$2</i>")
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g, (_match, label: string, href: string) => {
      // Defense in depth: Telegram's HTML parser already strips non-http(s)
      // href values, but reject them here too so a hostile model output that
      // builds `javascript:` or `data:` URLs from markdown link syntax never
      // produces a clickable payload even on a future parser regression.
      try {
        const parsed = new URL(href)
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return label
        return `<a href="${parsed.href}">${label}</a>`
      } catch {
        return label
      }
    })
    .replace(/^#{1,6}\s+(.+)$/gm, "<b>$1</b>")
}
