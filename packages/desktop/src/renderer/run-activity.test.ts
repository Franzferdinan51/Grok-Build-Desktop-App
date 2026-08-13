import test from "node:test"
import assert from "node:assert/strict"
import { activityTone, normalizeRunPhase, runActivityFor } from "./run-activity.ts"

test("run activity normalizes only supported phases", () => {
  assert.equal(normalizeRunPhase("executing"), "executing")
  assert.equal(normalizeRunPhase("tooling"), null)
})

test("run activity provides stable labels and tones", () => {
  assert.deepEqual(runActivityFor("recovering", "Session could not resume", 10), { phase: "recovering", label: "Recovering task", detail: "Session could not resume", at: 10 })
  assert.equal(activityTone("completed"), "success")
  assert.equal(activityTone("failed"), "error")
})
