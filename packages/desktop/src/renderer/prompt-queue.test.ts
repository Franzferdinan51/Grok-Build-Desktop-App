import assert from "node:assert/strict"
import test from "node:test"
import { describePromptQueue, dequeuePrompt, enqueuePrompt, parkThreadQueue, parsePromptQueue, promoteQueuedPrompt, removeQueuedPrompt, shouldAutoDrain, unparkThreadQueue, updateQueuedPrompt } from "./prompt-queue.ts"

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

test("promoteQueuedPrompt moves a row to the head without duplicating it", () => {
  const queue = enqueuePrompt(enqueuePrompt(enqueuePrompt([], "first", "a", 1), "second", "b", 2), "third", "c", 3)
  assert.deepEqual(promoteQueuedPrompt(queue, "c").map((entry) => entry.id), ["c", "a", "b"])
  assert.deepEqual(promoteQueuedPrompt(queue, "a").map((entry) => entry.id), ["a", "b", "c"])
})

test("updateQueuedPrompt rewrites one row and ignores blank text", () => {
  const queue = enqueuePrompt(enqueuePrompt([], "alpha", "a", 1), "beta", "b", 2)
  assert.equal(updateQueuedPrompt(queue, "b", "  beta now  ")[1]?.text, "beta now")
  assert.equal(updateQueuedPrompt(queue, "b", "   ")[1]?.text, "beta")
})

test("shouldAutoDrain waits after Stop and resumes after send-now or a new enqueue", () => {
  assert.equal(shouldAutoDrain({ isBusy: false, parked: false, queueLength: 1 }), true)
  assert.equal(shouldAutoDrain({ isBusy: true, parked: false, queueLength: 1 }), false)
  assert.equal(shouldAutoDrain({ isBusy: false, parked: true, queueLength: 1 }), false)
  assert.equal(shouldAutoDrain({ isBusy: false, parked: false, queueLength: 0 }), false)
})

test("parkThreadQueue only holds a thread that still has queued work", () => {
  const parked = parkThreadQueue(new Set(), "t1", 2)
  assert.equal(parked.has("t1"), true)
  assert.equal(parkThreadQueue(parked, "t1", 0).has("t1"), false)
  assert.equal(unparkThreadQueue(parked, "t1").has("t1"), false)
})
