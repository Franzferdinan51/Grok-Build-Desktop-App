/**
 * Pure helpers for the live event buffer the renderer maintains between
 * frames during a Grok Build task. Extracted from App.tsx so the merge /
 * frame-batching logic can be exercised from the smoke harness without
 * bootstrapping the Solid runtime.
 */

export const MAX_LIVE_LOG_CHARS = 2 * 1024 * 1024
export const MAX_LIVE_LOG_ENTRIES = 500

export type EventLog = { kind: "text" | "thought" | "error"; content: string }

/**
 * Append `incoming` to `target`, coalescing adjacent entries of the same
 * kind (so streamed token chunks for the same thought/text/error stream
 * merge into one row). Then trim the tail so total content stays bounded
 * by `MAX_LIVE_LOG_CHARS` and total entries stay bounded by
 * `MAX_LIVE_LOG_ENTRIES`, preferring the most recent output.
 */
export function mergeLogs(target: EventLog[], incoming: EventLog[]): EventLog[] {
  if (!incoming.length) return target
  const next = target.slice()
  for (const log of incoming) {
    const previous = next[next.length - 1]
    if (previous?.kind === log.kind) next[next.length - 1] = { ...previous, content: previous.content + log.content }
    else next.push(log)
  }
  let chars = 0
  const bounded: EventLog[] = []
  for (let index = next.length - 1; index >= 0 && bounded.length < MAX_LIVE_LOG_ENTRIES; index--) {
    const log = next[index]
    const remaining = MAX_LIVE_LOG_CHARS - chars
    if (remaining <= 0) break
    bounded.push(log.content.length > remaining ? { ...log, content: log.content.slice(-remaining) } : log)
    chars += Math.min(log.content.length, remaining)
  }
  return bounded.reverse()
}
