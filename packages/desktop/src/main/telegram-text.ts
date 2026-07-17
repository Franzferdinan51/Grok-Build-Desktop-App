export function telegramTextChunks(text: string, limit = 3900): string[] {
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
