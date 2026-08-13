import assert from "node:assert/strict"
import test from "node:test"
import { mkdirSync, mkdtempSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { encodeSessionCwd, planTitle, readSessionPlan, sessionGroupDir } from "./grok-session-files.ts"

function grokEnv(home: string): NodeJS.ProcessEnv {
  return { ...process.env, GROK_HOME: home }
}

test("encodeSessionCwd matches Grok's URL-encoded cwd groups", () => {
  assert.equal(encodeSessionCwd("/Users/duckets/Desktop/Grok-Build-Desktop-App"), "%2FUsers%2Fduckets%2FDesktop%2FGrok-Build-Desktop-App")
})

test("readSessionPlan prefers the requested session, then the newest plan.md", () => {
  const home = mkdtempSync(join(tmpdir(), "grok-session-files-"))
  const cwd = "/tmp/demo-project"
  const group = join(home, "sessions", encodeSessionCwd(cwd))
  mkdirSync(join(group, "old-session"), { recursive: true })
  mkdirSync(join(group, "new-session"), { recursive: true })
  writeFileSync(join(group, "old-session", "plan.md"), "# Old plan\nDo not pick this.")
  writeFileSync(join(group, "new-session", "plan.md"), "# New plan\nLatest approach.")
  writeFileSync(join(group, "new-session", "plan.json"), JSON.stringify({ todos: { "1": "write tests" } }))

  const requested = readSessionPlan(cwd, "old-session", grokEnv(home))
  assert.equal(requested?.sessionId, "old-session")
  assert.match(requested?.markdown || "", /Old plan/)

  const latest = readSessionPlan(cwd, undefined, grokEnv(home))
  assert.equal(latest?.sessionId, "new-session")
  assert.equal(planTitle(latest?.markdown || ""), "New plan")
  assert.deepEqual(latest?.todos, { todos: { "1": "write tests" } })
  assert.equal(sessionGroupDir(cwd, grokEnv(home)), group)
})

test("readSessionPlan follows hashed session groups via .cwd", () => {
  const home = mkdtempSync(join(tmpdir(), "grok-session-hash-"))
  const cwd = "/very/long/path"
  const group = join(home, "sessions", "slug-hash")
  mkdirSync(join(group, "sess-1", "goal"), { recursive: true })
  writeFileSync(join(group, ".cwd"), `${cwd}\n`)
  writeFileSync(join(group, "sess-1", "goal", "plan.md"), "# Nested goal plan")
  const plan = readSessionPlan(cwd, "sess-1", grokEnv(home))
  assert.equal(plan?.sessionId, "sess-1")
  assert.match(plan?.markdown || "", /Nested goal plan/)
})

test("readSessionPlan returns null when nothing is saved", () => {
  const home = mkdtempSync(join(tmpdir(), "grok-session-empty-"))
  assert.equal(readSessionPlan("/missing", undefined, grokEnv(home)), null)
})
