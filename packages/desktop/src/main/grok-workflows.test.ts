import assert from "node:assert/strict"
import test from "node:test"
import { mkdirSync, mkdtempSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { listGrokWorkflows, officialWorkflowPrompt, parseWorkflowMeta } from "./grok-workflows.ts"

test("parseWorkflowMeta reads the official Rhai meta map", () => {
  const source = `let meta = #{\n    name: "review-changes",\n    description: "Review the current branch",\n    when_to_use: "after edits",\n};\n`
  assert.deepEqual(parseWorkflowMeta(source), {
    name: "review-changes",
    description: "Review the current branch",
  })
})

test("listGrokWorkflows prefers project scripts over user scripts with the same name", () => {
  const home = mkdtempSync(join(tmpdir(), "grok-workflows-"))
  const workspace = mkdtempSync(join(tmpdir(), "grok-ws-"))
  mkdirSync(join(workspace, ".grok", "workflows"), { recursive: true })
  mkdirSync(join(home, "workflows"), { recursive: true })
  writeFileSync(join(workspace, ".grok", "workflows", "review-changes.rhai"), `let meta = #{\n    name: "review-changes",\n    description: "Project review",\n};\n`)
  writeFileSync(join(home, "workflows", "review-changes.rhai"), `let meta = #{\n    name: "review-changes",\n    description: "User review",\n};\n`)
  writeFileSync(join(home, "workflows", "audit.rhai"), `let meta = #{\n    name: "audit",\n    description: "User audit",\n};\n`)
  const listed = listGrokWorkflows(workspace, { ...process.env, GROK_HOME: home })
  assert.deepEqual(listed.map((entry) => [entry.name, entry.scope, entry.description]), [
    ["audit", "user", "User audit"],
    ["review-changes", "project", "Project review"],
  ])
})

test("officialWorkflowPrompt is the documented headless launch string", () => {
  assert.equal(officialWorkflowPrompt("review-changes"), "/workflow review-changes")
  assert.equal(officialWorkflowPrompt("review-changes", '{"target":"HEAD"}'), "/workflow review-changes {\"target\":\"HEAD\"}")
})
