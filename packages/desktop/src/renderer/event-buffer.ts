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

export type EventLog = { kind: "text" | "thought" | "error"; content: string }

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
  return next
}
