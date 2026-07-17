export type TaskLog = { kind: "text" | "thought" | "error"; content: string }

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

  return merged.flatMap((log) => {
    if (log.kind !== "text" || !reasoningTag.test(log.content)) return [log]
    const parts: TaskLog[] = []
    let cursor = 0
    for (const match of log.content.matchAll(reasoningBlock)) {
      const index = match.index ?? 0
      const before = log.content.slice(cursor, index).trim()
      if (before) parts.push({ kind: "text", content: before })
      const thought = match[2]?.trim()
      if (thought) parts.push({ kind: "thought", content: thought })
      cursor = index + match[0].length
    }
    const after = log.content.slice(cursor).replace(closingReasoningTag, "").trim()
    if (after) parts.push({ kind: "text", content: after })
    return parts
  })
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
