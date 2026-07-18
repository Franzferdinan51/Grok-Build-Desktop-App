/**
 * conversation-save.ts — Per-thread + debounced conversation writes.
 *
 * The previous implementation chained every save onto a single
 * `saveChain = saveChain.then(...)` and rewrote every thread on every
 * edit. After N edits the chain had N pending steps, each iterating
 * every thread through IPC. After ~100 edits on a multi-thread workspace
 * the renderer would queue 100s of IPC calls and 100s of fsync-equivalent
 * atomic writes on the main process.
 *
 * This module exposes a small `ConversationWriter` that:
 *  - caches an in-flight `Promise` per thread id so a re-entrant save
 *    coalesces onto the latest snapshot,
 *  - debounces a 250ms trailing flush for the active thread so transient
 *    edits (keystrokes, multiple microtask updates) coalesce into one write,
 *  - falls back to immediate writes when `flush()` is called explicitly
 *    so the user does not lose the last edit if they close the app.
 */

import type { StoredChatThread } from "../preload/index"

export type SaveableThread = StoredChatThread

const DEBOUNCE_MS = 250

type SaveFn = (thread: SaveableThread) => Promise<unknown>

type Flushable =
  | {
      /** Per-thread in-flight Promise cache. Re-entrant saves coalesce. */
      inflight: Map<string, Promise<unknown>>
      /** Debounced per-thread timers. */
      pending: Map<string, { timer: ReturnType<typeof setTimeout>; latest: SaveableThread }>
      /** Flush any pending per-thread debounced writes now. */
      flush(threadIds?: Iterable<string>): Promise<void>
      /** Schedule a save. The call resolves when the snapshot is durable. */
      save(thread: SaveableThread): Promise<void>
    }

export function createConversationWriter(save: SaveFn): Flushable {
  const inflight = new Map<string, Promise<unknown>>()
  const pending = new Map<string, { timer: ReturnType<typeof setTimeout>; latest: SaveableThread }>()

  const writeNow = (thread: SaveableThread) => {
    const prev = inflight.get(thread.id) || Promise.resolve()
    const next = prev.then(() => save(thread)).catch((error: unknown) => {
      // Surface failures instead of poisoning later saves, but keep the
      // chain moving so subsequent saves can still resolve.
      console.error("Conversation save failed", error)
    })
    inflight.set(thread.id, next)
    return next
  }

  return {
    inflight,
    pending,
    flush: async (threadIds?: Iterable<string>) => {
      const ids = threadIds ? new Set(threadIds) : new Set(pending.keys())
      for (const id of ids) {
        const entry = pending.get(id)
        if (!entry) continue
        clearTimeout(entry.timer)
        pending.delete(id)
        await writeNow(entry.latest)
      }
    },
    save: async (thread: SaveableThread) => {
      const existing = pending.get(thread.id)
      if (existing) {
        clearTimeout(existing.timer)
        existing.latest = thread
        existing.timer = setTimeout(() => {
          const entry = pending.get(thread.id)
          if (!entry) return
          pending.delete(thread.id)
          void writeNow(entry.latest)
        }, DEBOUNCE_MS)
        return
      }
      const entry: { timer: ReturnType<typeof setTimeout>; latest: SaveableThread } = {
        timer: setTimeout(() => {
          const current = pending.get(thread.id)
          if (!current) return
          pending.delete(thread.id)
          void writeNow(current.latest)
        }, DEBOUNCE_MS),
        latest: thread,
      }
      pending.set(thread.id, entry)
    },
  }
}
