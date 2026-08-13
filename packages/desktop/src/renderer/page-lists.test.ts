import assert from "node:assert/strict"
import test from "node:test"
import { filterSchedules, filterSkills, formatRepeat, groupSkills, objectRows, scheduleState, skillScopeCounts } from "./page-lists.ts"

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
    { id: "1", name: "Nightly", prompt: "test", cwd: "/repo", enabled: true, nextRunAt: 200, lastStatus: "completed" as const },
    { id: "2", name: "Paused", prompt: "docs", cwd: "/repo", enabled: false, nextRunAt: 100, lastStatus: "failed" as const },
  ]
  assert.equal(scheduleState(tasks[0]!), "active")
  assert.equal(scheduleState(tasks[1]!), "failed")
  assert.equal(filterSchedules(tasks, "night")[0]?.id, "1")
  assert.equal(formatRepeat(undefined), "Once")
  assert.equal(formatRepeat(60), "Hourly")
  assert.equal(formatRepeat(1440), "Daily")
})

test("objectRows flattens local-runtime snapshots", () => {
  assert.deepEqual(objectRows({ reachable: true, gpus: 1 }), [
    { key: "reachable", value: "true" },
    { key: "gpus", value: "1" },
  ])
  assert.deepEqual(objectRows(["nope"]), [])
})
