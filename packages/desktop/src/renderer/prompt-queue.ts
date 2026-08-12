/**
 * Durable FIFO for composer prompts submitted while a Grok Build task is
 * already running. The renderer persists the queue with the active thread
 * so queued work survives a relaunch instead of vanishing with in-memory
 * Solid signals.
 */

export type QueuedPrompt = { id: string; text: string; createdAt: number }

const MAX_QUEUED_PROMPTS = 32
const MAX_QUEUED_TEXT = 16_000

export function enqueuePrompt(queue: QueuedPrompt[], text: string, id?: string, now = Date.now()): QueuedPrompt[] {
  const trimmed = text.trim()
  if (!trimmed) return queue
  const entry: QueuedPrompt = {
    id: id || `queue-${now}`,
    text: trimmed.length > MAX_QUEUED_TEXT ? `${trimmed.slice(0, MAX_QUEUED_TEXT)}\n… [truncated]` : trimmed,
    createdAt: now,
  }
  return [...queue, entry].slice(-MAX_QUEUED_PROMPTS)
}

export function dequeuePrompt(queue: QueuedPrompt[]): { next?: QueuedPrompt; remaining: QueuedPrompt[] } {
  if (!queue.length) return { remaining: queue }
  const [next, ...remaining] = queue
  return { next, remaining }
}

export function removeQueuedPrompt(queue: QueuedPrompt[], id: string): QueuedPrompt[] {
  return queue.filter((entry) => entry.id !== id)
}

export function describePromptQueue(queue: QueuedPrompt[]): string {
  if (!queue.length) return "Queue is empty."
  return queue.map((entry, index) => `${index + 1}. ${entry.text.replace(/\s+/g, " ").slice(0, 120)}`).join("\n")
}

export function parsePromptQueue(raw: unknown): QueuedPrompt[] {
  if (!Array.isArray(raw)) return []
  const parsed: QueuedPrompt[] = []
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const record = item as Record<string, unknown>
    if (typeof record.id !== "string" || typeof record.text !== "string") continue
    const text = record.text.trim()
    if (!text) continue
    parsed.push({
      id: record.id,
      text: text.slice(0, MAX_QUEUED_TEXT),
      createdAt: typeof record.createdAt === "number" && Number.isFinite(record.createdAt) ? record.createdAt : 0,
    })
  }
  return parsed.slice(-MAX_QUEUED_PROMPTS)
}
