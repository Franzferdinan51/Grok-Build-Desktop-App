import test from "node:test"
import assert from "node:assert/strict"
import { canResumeRun, runDiagnostics, runDurationLabel } from "./run-detail.ts"
import type { GrokRunRecord } from "../preload/index.ts"

const run: GrokRunRecord = { id: "r1", threadId: "t1", cwd: "/workspace", prompt: "Fix the bug", model: "grok", startedAt: 1000, finishedAt: 3500, status: "failed", grokSessionId: "s1", error: "provider unavailable", errorClass: "provider" }

test("run detail exposes resumable sessions and stable diagnostics", () => {
  assert.equal(canResumeRun(run), true)
  assert.equal(runDurationLabel(run), "2.5s")
  assert.match(runDiagnostics(run), /Session: s1/)
  assert.match(runDiagnostics(run), /Error class: provider/)
})

test("running or identity-less runs cannot be resumed", () => {
  assert.equal(canResumeRun({ ...run, status: "running" }), false)
  assert.equal(canResumeRun({ ...run, threadId: undefined }), false)
  assert.equal(canResumeRun({ ...run, grokSessionId: undefined }), false)
})
