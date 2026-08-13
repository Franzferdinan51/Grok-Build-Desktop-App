import type { TaskLog } from "./chat-utils"

export type ActivityEntry = {
  id: string
  kind: "response" | "reasoning" | "error"
  label: string
  detail: string
  count: number
}

const labels = { text: "Response", thought: "Reasoning", error: "Error" } as const
const MAX_REASONING_DETAIL_CHARS = 12_000

/** Convert the bounded stream shown by the inspector into stable, grouped rows. */
export function buildActivityTimeline(logs: TaskLog[], maxEntries = 12): ActivityEntry[] {
  const entries: ActivityEntry[] = []
  let reasoning: ActivityEntry | undefined
  let reasoningInsertIndex = -1
  const reasoningParts: string[] = []
  for (const log of logs) {
    const detail = log.content.trim()
    if (!detail) continue
    const previous = entries.at(-1)
    const kind = log.kind === "text" ? "response" : log.kind === "thought" ? "reasoning" : "error"
    if (kind === "reasoning") {
      if (!reasoning) {
        reasoning = { id: "reasoning:consolidated", kind, label: "Reasoning", detail: "", count: 0 }
        reasoningInsertIndex = entries.length
        entries.push(reasoning)
      }
      reasoning.count += 1
      if (reasoningParts.at(-1) !== detail) reasoningParts.push(detail)
      reasoning.detail = reasoningParts.join("\n\n").slice(0, MAX_REASONING_DETAIL_CHARS)
      continue
    }
    if (previous && previous.kind === kind && previous.detail === detail) {
      previous.count += 1
      continue
    }
    entries.push({ id: `${kind}:${entries.length}:${detail.slice(0, 24)}`, kind, label: labels[log.kind], detail, count: 1 })
  }
  // Reasoning can be emitted before, between, and after tool/response updates.
  // Keep it as one stable inspector row instead of making every phase look like
  // a new chat turn. The count remains useful for diagnosing noisy providers.
  if (reasoning && reasoningInsertIndex >= 0) entries[reasoningInsertIndex] = reasoning
  return entries.slice(-Math.max(1, maxEntries))
}
