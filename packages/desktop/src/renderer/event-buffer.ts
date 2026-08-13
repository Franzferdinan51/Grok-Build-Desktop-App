/**
 * Pure helpers for the live event buffer the renderer maintains between
 * frames during a Grok Build task. Extracted from App.tsx so the merge /
 * frame-batching logic can be exercised from the smoke harness without
 * bootstrapping the Solid runtime.
 *
 * The cap applies to the *committed* log on each flush, not to the
 * incoming queue. Callers (e.g. the renderer's rAF queue) coalesce
 * arbitrary numbers of incoming chunks before calling `mergeLogs` once
 * per frame.
 */

export const MAX_LIVE_LOG_CHARS = 2 * 1024 * 1024
export const MAX_LIVE_LOG_ENTRIES = 500
export const MAX_CONSOLIDATED_THOUGHT_CHARS = 12_000
export const MAX_CONSOLIDATED_THOUGHT_UPDATES = 96

export type EventLog = { kind: "text" | "thought" | "error"; content: string }

/**
 * Keep provider reasoning as one diagnostic record per run. Grok can emit
 * thought chunks before, between, and after response/tool updates; retaining
 * each phase as a separate row makes the live transcript look like multiple
 * assistant turns and needlessly increases renderer work. Repeated identical
 * status updates are dropped while distinct reasoning updates remain visible.
 * Public response and error ordering remains unchanged.
 */
export function consolidateThoughts(logs: EventLog[]): EventLog[] {
  const firstThought = logs.findIndex((log) => log.kind === "thought")
  if (firstThought < 0) return logs
  const thoughtParts: string[] = []
  const seenThoughts = new Set<string>()
  for (const log of logs) {
    if (log.kind !== "thought") continue
    const detail = log.content.trim()
    if (!detail || seenThoughts.has(detail)) continue
    seenThoughts.add(detail)
    thoughtParts.push(detail)
    if (thoughtParts.length >= MAX_CONSOLIDATED_THOUGHT_UPDATES) break
  }
  const thought = thoughtParts.join("\n\n")
  const marker = "\n\n[… reasoning condensed …]\n\n"
  const available = MAX_CONSOLIDATED_THOUGHT_CHARS - marker.length
  const headLength = Math.floor(available * 0.7)
  const bounded = thought.length <= MAX_CONSOLIDATED_THOUGHT_CHARS
    ? thought
    : `${thought.slice(0, headLength)}${marker}${thought.slice(-(available - headLength))}`
  const result: EventLog[] = []
  logs.forEach((log, index) => {
    if (log.kind !== "thought") result.push(log)
    else if (index === firstThought && bounded) result.push({ kind: "thought", content: bounded })
  })
  return result
}

/**
 * Track running totals so each call does NOT redo an O(n) sum over the
 * prior committed log. The previous implementation recomputed the byte
 * budget on every token chunk; on long streams the cost grew quadratically.
 */
class RunningTotals {
  chars = 0
  entries = 0
}

export class LiveEventBuffer {
  private target: EventLog[] = []
  private totals = new RunningTotals()

  /**
   * Append `incoming` to the committed log, coalescing adjacent entries of
   * the same kind (so streamed token chunks for the same thought / text /
   * error stream merge into one row). Trims the tail so total content stays
   * bounded by `MAX_LIVE_LOG_CHARS` and total entries stay bounded by
   * `MAX_LIVE_LOG_ENTRIES`, preferring the most recent output.
   */
  append(incoming: EventLog[]): EventLog[] {
    if (!incoming.length) return this.target
    for (const log of incoming) {
      const previous = this.target[this.target.length - 1]
      if (previous?.kind === log.kind) {
        // Adjacent entries of the same kind coalesce in place. Update
        // totals incrementally.
        this.totals.chars -= previous.content.length
        previous.content += log.content
        this.totals.chars += previous.content.length
      } else {
        this.target.push({ ...log })
        this.totals.chars += log.content.length
        this.totals.entries += 1
      }
      this.evict()
    }
    this.target = consolidateThoughts(this.target)
    this.totals.entries = this.target.length
    this.totals.chars = this.target.reduce((sum, log) => sum + log.content.length, 0)
    return this.target
  }

  /**
   * Drop the oldest entries (and the older half of an oversized entry)
   * until the running totals fit the cap. The eviction prefers dropping
   * whole entries first; only the most recent entry is sliced.
   */
  private evict(): void {
    while (this.totals.entries > MAX_LIVE_LOG_ENTRIES && this.target.length > 0) {
      const removed = this.target.shift()!
      this.totals.chars -= removed.content.length
      this.totals.entries -= 1
    }
    if (this.totals.chars > MAX_LIVE_LOG_CHARS) {
      const head = this.target[this.target.length - 1]
      if (head) {
        const overflow = this.totals.chars - MAX_LIVE_LOG_CHARS
        if (overflow >= head.content.length) {
          // Total overflow exceeds the head — drop the head. The loop
          // re-checks after the subtraction in case the next head is
          // also too large (e.g. several 200kB thoughts).
          this.totals.chars -= head.content.length
          this.totals.entries -= 1
          this.target.pop()
        } else {
          head.content = head.content.slice(overflow)
          this.totals.chars -= overflow
        }
      }
    }
  }

  /** Snapshot the current committed log; useful for tests + flush callers. */
  snapshot(): EventLog[] {
    return this.target.slice()
  }

  reset(): void {
    this.target = []
    this.totals = new RunningTotals()
  }
}

/**
 * Functional variant retained for the existing tests + the existing
 * call sites that prefer an immutable API. Walks once and tracks totals
 * inline, so the work is O(n) regardless of the buffer size.
 */
export function mergeLogs(target: EventLog[], incoming: EventLog[]): EventLog[] {
  if (!incoming.length) return target
  const next = target.slice()
  let chars = 0
  for (const log of next) chars += log.content.length
  for (const log of incoming) {
    const previous = next[next.length - 1]
    if (previous?.kind === log.kind) {
      chars -= previous.content.length
      previous.content += log.content
      chars += previous.content.length
    } else {
      next.push({ ...log })
      chars += log.content.length
    }
    if (chars > MAX_LIVE_LOG_CHARS && next.length > 0) {
      const last = next[next.length - 1]!
      if (last.content.length > MAX_LIVE_LOG_CHARS) {
        last.content = last.content.slice(-MAX_LIVE_LOG_CHARS)
        chars = MAX_LIVE_LOG_CHARS
      }
    }
    while (next.length > MAX_LIVE_LOG_ENTRIES) {
      const removed = next.shift()!
      chars -= removed.content.length
    }
  }
  return consolidateThoughts(next)
}
