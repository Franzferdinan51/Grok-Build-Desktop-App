import assert from "node:assert/strict"
import test from "node:test"
import { dequeueChatTasks, describeCancelChat, enqueueTelegramTask, prioritizeTelegramTask, type TelegramQueueEntry } from "./telegram-queue.ts"

test("enqueue appends and prioritize puts work first", () => {
  const queue: TelegramQueueEntry[] = []
  enqueueTelegramTask(queue, { chatId: "1", text: "later", queuedAt: 1 })
  prioritizeTelegramTask(queue, { chatId: "1", text: "now", queuedAt: 2 })
  assert.deepEqual(queue.map((entry) => entry.text), ["now", "later"])
})

test("dequeueChatTasks removes only that chat", () => {
  const queue = [
    { chatId: "1", text: "a", queuedAt: 1 },
    { chatId: "2", text: "b", queuedAt: 2 },
    { chatId: "1", text: "c", queuedAt: 3 },
  ]
  assert.equal(dequeueChatTasks(queue, "1"), 2)
  assert.deepEqual(queue.map((entry) => entry.chatId), ["2"])
})

test("cancel stops the owning chat and also drains its queue", () => {
  const result = describeCancelChat({ chatId: "9", runningChat: "9", reserved: true, backendRunning: true, dequeued: 2 })
  assert.equal(result.cancelBackend, true)
  assert.equal(result.ownsActive, true)
  assert.match(result.message, /Stopping/)
})

test("cancel without an owner still stops a reserved harness", () => {
  const result = describeCancelChat({ chatId: "9", runningChat: "", reserved: true, backendRunning: false, dequeued: 0 })
  assert.equal(result.cancelBackend, true)
  assert.match(result.message, /Stopping the active/)
})

test("cancel dequeues work when this chat is idle", () => {
  const result = describeCancelChat({ chatId: "9", runningChat: "8", reserved: true, backendRunning: true, dequeued: 1 })
  assert.equal(result.cancelBackend, false)
  assert.match(result.message, /Removed 1 queued/)
})
