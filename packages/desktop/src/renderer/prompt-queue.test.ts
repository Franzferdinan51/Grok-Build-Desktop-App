import assert from "node:assert/strict"
import test from "node:test"
import { describePromptQueue, dequeuePrompt, enqueuePrompt, parsePromptQueue, removeQueuedPrompt } from "./prompt-queue.ts"

test("enqueuePrompt ignores blank input and trims text", () => {
  assert.deepEqual(enqueuePrompt([], "   "), [])
  const queued = enqueuePrompt([], "  fix the parser  ", "q1", 10)
  assert.equal(queued.length, 1)
  assert.equal(queued[0]?.text, "fix the parser")
  assert.equal(queued[0]?.id, "q1")
})

test("dequeuePrompt pops FIFO and leaves remaining work", () => {
  const queue = enqueuePrompt(enqueuePrompt([], "first", "a", 1), "second", "b", 2)
  const first = dequeuePrompt(queue)
  assert.equal(first.next?.text, "first")
  assert.equal(first.remaining.length, 1)
  assert.equal(dequeuePrompt([]).next, undefined)
})

test("removeQueuedPrompt and describePromptQueue report the live FIFO", () => {
  const queue = enqueuePrompt(enqueuePrompt([], "alpha", "a", 1), "beta", "b", 2)
  assert.match(describePromptQueue(queue), /1\. alpha/)
  assert.equal(describePromptQueue([]), "Queue is empty.")
  assert.deepEqual(removeQueuedPrompt(queue, "a").map((entry) => entry.id), ["b"])
})

test("parsePromptQueue rejects malformed snapshots and keeps valid ones", () => {
  assert.deepEqual(parsePromptQueue(null), [])
  assert.deepEqual(parsePromptQueue([{ id: 1, text: "nope" }]), [])
  const restored = parsePromptQueue([{ id: "ok", text: " retry me ", createdAt: 9 }])
  assert.equal(restored[0]?.text, "retry me")
  assert.equal(restored[0]?.createdAt, 9)
})
