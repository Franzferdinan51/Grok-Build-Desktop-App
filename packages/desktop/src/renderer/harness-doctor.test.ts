import assert from "node:assert/strict"
import test from "node:test"
import { summarizeHarnessDoctor } from "./harness-doctor.ts"

test("summarizeHarnessDoctor passes a ready Grok Build install", () => {
  const report = summarizeHarnessDoctor({ available: true, command: "grok", version: "0.2.102", grokAuthExists: true })
  assert.equal(report.ok, true)
  assert.match(report.lines.join("\n"), /PASS  Grok Build CLI/)
})

test("summarizeHarnessDoctor fails when the harness is missing", () => {
  const report = summarizeHarnessDoctor({ available: false, command: "grok", error: "not on PATH", grokAuthExists: false })
  assert.equal(report.ok, false)
  assert.match(report.lines.join("\n"), /FAIL  Grok Build CLI/)
})
