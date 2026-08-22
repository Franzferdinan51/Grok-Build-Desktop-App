import test from "node:test"
import assert from "node:assert/strict"
import { buildBaseArgs, promptArgsFor } from "./grok-args.ts"
import type { RunTaskInput } from "./grok-build-backend.ts"

const input = (overrides: Partial<RunTaskInput> = {}): RunTaskInput => ({
  prompt: "continue the task",
  cwd: "/tmp/workspace",
  ...overrides,
})

test("builds the verified native continue flag", () => {
  const args = buildBaseArgs(input({ continueSession: true, resume: "old-session", forkSession: true }), ["-p", "continue the task"])
  assert.ok(args.includes("--continue"))
  assert.ok(!args.includes("--resume"))
  assert.ok(!args.includes("--fork-session"))
})

test("keeps explicit resume behavior when continue is disabled", () => {
  const args = buildBaseArgs(input({ resume: "saved-session", forkSession: true }), ["-p", "continue the task"])
  assert.ok(args.includes("--resume"))
  assert.ok(args.includes("saved-session"))
  assert.ok(args.includes("--fork-session"))
})

test("plan mode never forwards plan as a permission-mode value", () => {
  const task = input({ permissionMode: "plan", noPlan: false })
  const args = buildBaseArgs(task, promptArgsFor(task))
  const permissionIndex = args.indexOf("--permission-mode")

  assert.notEqual(permissionIndex, -1)
  assert.equal(args[permissionIndex + 1], "auto")
  assert.ok(!args.includes("plan"))
  assert.ok(!args.includes("--no-plan"))
})

test("plan mode asks the native agent to enter plan mode before implementation", () => {
  const task = input({ permissionMode: "plan", noPlan: false, prompt: "Refactor authentication" })
  const args = promptArgsFor(task)

  assert.equal(args[0], "-p")
  assert.match(args[1] || "", /enter_plan_mode/)
  assert.match(args[1] || "", /Refactor authentication/)
})

test("structured browser planner does not receive the coding plan directive", () => {
  const task = input({
    permissionMode: "plan",
    noPlan: false,
    prompt: "Choose the next browser action",
    jsonSchema: JSON.stringify({ type: "object" }),
  })
  const args = promptArgsFor(task)

  assert.equal(args[1], "Choose the next browser action")
  assert.doesNotMatch(args[1] || "", /enter_plan_mode/)
})