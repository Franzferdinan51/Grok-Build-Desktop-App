import assert from "node:assert/strict"
import test from "node:test"
import { filterSchedules, filterSkills, filterWorkflows, formatRepeat, groupSkills, groupWorkflows, objectRows, scheduleState, skillScopeCounts, workflowScopeCounts } from "./page-lists.ts"

const skills = [
  { name: "review", description: "Review code", path: ".grok/skills/review", scope: "project" as const },
  { name: "search", description: "Web search", path: "~/.grok/skills/search", scope: "user" as const },
  { name: "cursor", description: "Compatible skill", path: ".cursor/skills/x", scope: "compatible" as const },
]

test("filterSkills searches and scopes", () => {
  assert.equal(filterSkills(skills, "", "all").length, 3)
  assert.equal(filterSkills(skills, "web", "all")[0]?.name, "search")
  assert.equal(filterSkills(skills, "", "project").length, 1)
  assert.deepEqual(skillScopeCounts(skills).user, 1)
  assert.deepEqual(groupSkills(skills).map((group) => group.scope), ["project", "user", "compatible"])
})

test("schedule helpers", () => {
  const tasks = [
    { id: "1", name: "Nightly", prompt: "test", cwd: "/repo", enabled: true, runAt: 200, nextRunAt: 200, lastStatus: "completed" as const },
    { id: "2", name: "Paused", prompt: "docs", cwd: "/repo", enabled: false, runAt: 100, nextRunAt: 100, lastStatus: "failed" as const },
  ]
  assert.equal(scheduleState(tasks[0]!), "active")
  assert.equal(scheduleState(tasks[1]!), "failed")
  assert.equal(filterSchedules(tasks, "night")[0]?.id, "1")
  assert.equal(formatRepeat(undefined), "Once")
  assert.equal(formatRepeat(60), "Hourly")
  assert.equal(formatRepeat(1440), "Daily")
})

test("filterWorkflows searches and scopes official Rhai scripts", () => {
  const workflows = [
    { name: "duck-agent-pull", description: "Pull QOL", path: ".grok/workflows/duck-agent-pull.rhai", scope: "project" as const },
    { name: "audit", description: "User audit", path: "~/.grok/workflows/audit.rhai", scope: "user" as const },
  ]
  assert.equal(filterWorkflows(workflows, "", "all").length, 2)
  assert.equal(filterWorkflows(workflows, "qol", "all")[0]?.name, "duck-agent-pull")
  assert.equal(filterWorkflows(workflows, "", "user").length, 1)
  assert.equal(workflowScopeCounts(workflows).project, 1)
  assert.deepEqual(groupWorkflows(workflows).map((group) => group.scope), ["project", "user"])
})

test("objectRows flattens local-runtime snapshots", () => {
  assert.deepEqual(objectRows({ reachable: true, gpus: 1 }), [
    { key: "reachable", value: "true" },
    { key: "gpus", value: "1" },
  ])
  assert.deepEqual(objectRows(["nope"]), [])
})
