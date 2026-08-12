/**
 * Ranked conversation search over visible title/summary/transcript text.
 * Thoughts and app-action tags are excluded so private reasoning never
 * becomes a search hit.
 */

export type SearchableThread = {
  id: string
  title: string
  summary?: string
  model?: string
  pinned?: boolean
  archived?: boolean
  updatedAt: number
  messages: { logs: { kind: string; content: string }[] }[]
}

export type RankedThread<T extends SearchableThread> = { thread: T; score: number }

const ACTION_TAG = /<app_action>[\s\S]*?<\/app_action>/g

export function visibleThreadText(thread: SearchableThread): string {
  const messages = thread.messages.flatMap((message) =>
    message.logs
      .filter((log) => log.kind === "text")
      .map((log) => log.content.replace(ACTION_TAG, "").trim())
      .filter(Boolean),
  )
  return [thread.title, thread.summary || "", thread.model || "", ...messages].join("\n")
}

export function rankConversationMatches<T extends SearchableThread>(threads: T[], query: string, now = Date.now()): T[] {
  const needle = query.trim().toLowerCase()
  const tokens = needle.split(/\s+/).filter(Boolean)
  if (!tokens.length) {
    return [...threads].sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.updatedAt - a.updatedAt)
  }
  const ranked: RankedThread<T>[] = []
  for (const thread of threads) {
    if (thread.archived) continue
    const title = thread.title.toLowerCase()
    const summary = (thread.summary || "").toLowerCase()
    const haystack = visibleThreadText(thread).toLowerCase()
    if (!tokens.every((token) => haystack.includes(token))) continue
    let score = 0
    if (title === needle) score += 80
    if (tokens.every((token) => title.includes(token))) score += 40
    if (tokens.every((token) => summary.includes(token))) score += 20
    score += Math.min(20, tokens.reduce((sum, token) => sum + (haystack.split(token).length - 1), 0))
    if (thread.pinned) score += 10
    const ageHours = Math.max(0, (now - thread.updatedAt) / 3_600_000)
    score += Math.max(0, 8 - Math.min(8, ageHours / 24))
    ranked.push({ thread, score })
  }
  return ranked.sort((a, b) => b.score - a.score || b.thread.updatedAt - a.thread.updatedAt).map((entry) => entry.thread)
}
