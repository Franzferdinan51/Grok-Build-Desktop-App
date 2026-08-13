export type TaskLog = { kind: "text" | "thought" | "error"; content: string }

// Reasoning is useful as an optional diagnostic, not as a second transcript.
// Keep the renderer and persisted chat responsive when a provider emits a very
// long chain of internal updates or a MoA advisor returns a large explanation.
export const MAX_CONSOLIDATED_REASONING_CHARS = 12_000

const reasoningTag = /<(think|thinking|analysis|reasoning)>/i
const reasoningBlock = /<(think|thinking|analysis|reasoning)>([\s\S]*?)(?:<\/\1>|$)/gi
const closingReasoningTag = /<\/(?:think|thinking|analysis|reasoning)>/gi

/** Merge streamed token chunks and turn provider reasoning tags into collapsible blocks. */
export function splitThinking(logs: TaskLog[]): TaskLog[] {
  const merged = logs.reduce<TaskLog[]>((all, log) => {
    const previous = all.at(-1)
    if (previous?.kind === log.kind) previous.content += log.content
    else all.push({ ...log })
    return all
  }, [])

  const parts = merged.flatMap((log) => {
    if (log.kind !== "text") return [log]
    // Always strip orphan closing reasoning tags so a model that streams a
    // closing delimiter without ever sending the opening tag cannot leak
    // the literal `</think>` into the user-visible chat pane. This mirrors
    // publicTelegramResponse in the Telegram bridge.
    if (!reasoningTag.test(log.content)) {
      const stripped = log.content.replace(closingReasoningTag, "").trim()
      return stripped ? [{ ...log, content: stripped }] : []
    }
    const parts: TaskLog[] = []
    let cursor = 0
    for (const match of log.content.matchAll(reasoningBlock)) {
      const index = match.index ?? 0
      // Strip orphan closing tags from the slice before the opening reasoning
      // tag too, so a flushed trailing `</think>` (or one emitted before a
      // late opening `<think>`) cannot leak into the public chat pane.
      const before = log.content.slice(cursor, index).replace(closingReasoningTag, "").trim()
      if (before) parts.push({ kind: "text", content: before })
      const thought = match[2]?.trim()
      if (thought) parts.push({ kind: "thought", content: thought })
      cursor = index + match[0].length
    }
    const after = log.content.slice(cursor).replace(closingReasoningTag, "").trim()
    if (after) parts.push({ kind: "text", content: after })
    return parts
  })
  // Providers may emit reasoning in several phases, separated by tool and
  // status events. Keep one collapsible thinking section per assistant turn
  // so the transcript does not become a stack of nearly identical panels.
  const thoughtIndexes = parts.flatMap((part, index) => part.kind === "thought" ? [index] : [])
  if (thoughtIndexes.length > 1) {
    const first = thoughtIndexes[0]!
    const combined = thoughtIndexes.map((index) => parts[index]!.content).filter(Boolean).join("\n\n")
    const firstPart = parts[first]!
    return parts.filter((_part, index) => !thoughtIndexes.includes(index) || index === first).map((part) => part === firstPart ? { kind: "thought", content: boundReasoning(combined) } : part)
  }
  return parts.map((part) => part.kind === "thought" ? { ...part, content: boundReasoning(part.content) } : part)
}

function boundReasoning(content: string): string {
  if (content.length <= MAX_CONSOLIDATED_REASONING_CHARS) return content
  const marker = "\n\n[… reasoning condensed …]\n\n"
  const available = MAX_CONSOLIDATED_REASONING_CHARS - marker.length
  const headLength = Math.floor(available * 0.7)
  const tailLength = available - headLength
  return `${content.slice(0, headLength)}${marker}${content.slice(-tailLength)}`
}

/** Always leave a visible completion message when a model only streams private reasoning. */
export function ensurePublicCompletion(logs: TaskLog[]): TaskLog[] {
  const normalized = splitThinking(logs)
  if (normalized.some((log) => log.kind === "text" || log.kind === "error")) return normalized
  return [...normalized, {
    kind: "text",
    content: "Task completed. Grok Build applied the changes but returned no public summary.",
  }]
}
