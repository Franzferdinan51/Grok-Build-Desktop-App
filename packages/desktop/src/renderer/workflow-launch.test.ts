import assert from "node:assert/strict"
import test from "node:test"
import { formatWorkflowCatalog, resolveWorkflowLaunch } from "./workflow-launch.ts"

const official = [{ name: "duck-agent-pull", description: "Pull Duck-Agent QOL", scope: "project" }]

test("empty /workflow lists the catalog", () => {
  assert.equal(resolveWorkflowLaunch("", official).kind, "list")
  assert.match(formatWorkflowCatalog(official), /duck-agent-pull \(project\)/)
})

test("discovered Rhai names beat Duck-Agent presets", () => {
  const launch = resolveWorkflowLaunch("duck-agent-pull {\"limit\":2}", official)
  assert.deepEqual(launch, { kind: "official", name: "duck-agent-pull", prompt: "/workflow duck-agent-pull {\"limit\":2}" })
})

test("Duck-Agent preset names still frame a Grok Build prompt", () => {
  const launch = resolveWorkflowLaunch("research compare flags", official)
  assert.equal(launch.kind, "preset")
  if (launch.kind !== "preset") return
  assert.equal(launch.name, "research")
  assert.match(launch.prompt, /\[Duck-Agent research workflow\]/)
  assert.equal(launch.noPlan, true)
})

test("pause/resume/stop stay official control slashes", () => {
  assert.deepEqual(resolveWorkflowLaunch("pause review-changes", official), {
    kind: "control",
    prompt: "/workflow pause review-changes",
  })
})

test("unknown names still pass through as official /workflow", () => {
  const launch = resolveWorkflowLaunch("builtin-review HEAD", official)
  assert.deepEqual(launch, { kind: "official", name: "builtin-review", prompt: "/workflow builtin-review HEAD" })
})
