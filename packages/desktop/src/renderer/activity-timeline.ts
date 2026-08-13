import type { TaskLog } from "./chat-utils"

export type ActivityEntry = {
  id: string
  kind: "response" | "reasoning" | "error"
  label: string
  detail: string
  count: number
}

const labels = { text: "Response", thought: "Reasoning", error: "Error" } as const

/** Convert the bounded stream shown by the inspector into stable, grouped rows. */
export function buildActivityTimeline(logs: TaskLog[], maxEntries = 12): ActivityEntry[] {
  const entries: ActivityEntry[] = []
  for (const log of logs) {
    const detail = log.content.trim()
    if (!detail) continue
    const previous = entries.at(-1)
    const kind = log.kind === "text" ? "response" : log.kind === "thought" ? "reasoning" : "error"
    if (previous && previous.kind === kind && previous.detail === detail) {
      previous.count += 1
      continue
    }
    entries.push({ id: `${kind}:${entries.length}:${detail.slice(0, 24)}`, kind, label: labels[log.kind], detail, count: 1 })
  }
  return entries.slice(-Math.max(1, maxEntries))
}
