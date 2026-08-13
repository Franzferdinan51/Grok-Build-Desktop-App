import test from "node:test"
import assert from "node:assert/strict"
import { buildBaseArgs } from "./grok-args.ts"
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
