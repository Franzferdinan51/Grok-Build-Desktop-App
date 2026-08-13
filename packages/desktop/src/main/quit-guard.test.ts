import test from "node:test"
import assert from "node:assert/strict"
import { quitPromptFor } from "./quit-guard.ts"

test("does not prompt when Grok Build is idle", () => {
  assert.equal(quitPromptFor({ count: 0 }), null)
})

test("describes an active task before quitting", () => {
  assert.deepEqual(quitPromptFor({ count: 1 }), {
    message: "Grok Build is still working on a task.",
    detail: "Quitting stops the active agent task.\nAny work it has not finished writing may be lost."
  })
})

test("does not interrupt an approved handoff quit", () => {
  assert.equal(quitPromptFor({ count: 1 }, true), null)
})
