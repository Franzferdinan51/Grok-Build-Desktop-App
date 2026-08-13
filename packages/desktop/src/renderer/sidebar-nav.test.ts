import assert from "node:assert/strict"
import test from "node:test"
import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const navSource = readFileSync(join(here, "sidebar-nav.ts"), "utf8")
const appSource = readFileSync(join(here, "App.tsx"), "utf8")
const iconFiles: Record<string, string> = {
  "new-task": "new-task.png",
  workspace: "workspace.png",
  terminal: "terminal.png",
  runs: "runs.png",
  artifacts: "artifacts.png",
  review: "review.png",
  skills: "skills.png",
  workflows: "workflows.png",
  scheduled: "scheduled.png",
  runtime: "runtime.png",
  telegram: "agent.png",
  "browser-agent": "browser.png",
  settings: "settings.png",
}

test("sidebar nav is the Imagine icon set, not text glyphs", () => {
  assert.match(navSource, /UI_ICONS/)
  assert.doesNotMatch(navSource, /icon: "✦"/)
  assert.match(appSource, /SIDEBAR_NAV/)
  assert.match(appSource, /sidebar__icon/)
  assert.match(appSource, /<img class="chat-empty__icon"/)
  for (const id of Object.keys(iconFiles)) {
    assert.match(navSource, new RegExp(id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
  }
})

test("every sidebar Imagine PNG is present on disk", () => {
  for (const file of Object.values(iconFiles)) {
    assert.equal(existsSync(join(here, "assets/icons", file)), true, file)
  }
})
