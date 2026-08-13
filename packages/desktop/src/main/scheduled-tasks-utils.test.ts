import test from "node:test"
import assert from "node:assert/strict"
import { withScheduleFinishPatch, withScheduleRunningPatch } from "./scheduled-tasks-utils.ts"

const task = { id: "s1", name: "Nightly", prompt: "test", cwd: "/repo", enabled: true, runAt: 100, nextRunAt: 100, repeatMinutes: 60 }

test("scheduled task patches expose running and failed detail without losing repeat timing", () => {
  const running = withScheduleRunningPatch(task, true)
  assert.equal(running.running, true)
  const finished = withScheduleFinishPatch(running, "failed", 200)
  const final = withScheduleRunningPatch(finished, false, "provider unavailable")
  assert.equal(final.running, false)
  assert.equal(final.lastStatus, "failed")
  assert.equal(final.lastError, "provider unavailable")
  assert.equal(final.nextRunAt, 3_600_200)
})
