import assert from "node:assert/strict"
import test from "node:test"
import { join } from "node:path"
import {
  buildHostControlsPromptBlock,
  buildSearchControlsPromptBlock,
  defaultHostHelperCandidates,
  resolveHostControls,
  resolveHostHelper,
  sanitizeHostHelperPath,
} from "./host-control-paths.ts"

const home = "/Users/example"
const browserDiscovered = join(home, ".openclaw", "workspace", "tools", "browser-control.sh")
const desktopDiscovered = join(home, ".openclaw", "workspace", "tools", "desktop-control.sh")
const searchDiscovered = join(home, ".openclaw", "workspace", "tools", "web-search-fallback.sh")

test("discovers helpers under the current home directory", () => {
  const existing = new Set([browserDiscovered, desktopDiscovered])
  const resolved = resolveHostControls({
    home,
    exists: (path) => existing.has(path),
  })
  assert.equal(resolved.disabled, false)
  assert.equal(resolved.browser.path, browserDiscovered)
  assert.equal(resolved.browser.source, "discovered")
  assert.equal(resolved.browser.exists, true)
  assert.equal(resolved.desktop.path, desktopDiscovered)
  assert.equal(resolved.desktop.source, "discovered")
  assert.equal(resolved.search.exists, false)
  assert.equal(resolved.search.source, "missing")
  assert.doesNotMatch(resolved.browser.path, /\/Users\/duckets\//)
})

test("prefers canonical settings over legacy keys, env, and discovery", () => {
  const resolved = resolveHostHelper("browser", {
    home,
    config: { browserScript: "/opt/helpers/browser.sh", browser: "/legacy/browser.sh" },
    env: { GROK_BROWSER_CONTROL: "/env/browser.sh" },
    exists: () => true,
  })
  assert.equal(resolved.path, "/opt/helpers/browser.sh")
  assert.equal(resolved.source, "settings")
})

test("accepts legacy browser/desktop store keys", () => {
  const resolved = resolveHostControls({
    home,
    config: { browser: "/legacy/browser.sh", desktop: "/legacy/desktop.sh" },
    exists: () => true,
  })
  assert.equal(resolved.browser.path, "/legacy/browser.sh")
  assert.equal(resolved.browser.source, "settings")
  assert.equal(resolved.desktop.path, "/legacy/desktop.sh")
  assert.equal(resolved.desktop.source, "settings")
})

test("uses environment overrides when settings are empty", () => {
  const resolved = resolveHostHelper("search", {
    home,
    env: { GROK_SEARCH_HELPER: "/usr/local/bin/search.sh" },
    exists: (path) => path === "/usr/local/bin/search.sh",
  })
  assert.equal(resolved.path, "/usr/local/bin/search.sh")
  assert.equal(resolved.source, "env")
  assert.equal(resolved.exists, true)
})

test("falls back through well-known home locations", () => {
  const grokTools = join(home, ".grok", "tools", "browser-control.sh")
  const resolved = resolveHostHelper("browser", {
    home,
    exists: (path) => path === grokTools,
  })
  assert.equal(resolved.path, grokTools)
  assert.equal(resolved.source, "discovered")
  assert.deepEqual(defaultHostHelperCandidates("browser", home)[0], browserDiscovered)
})

test("does not inject host-control prompt text when helpers are missing or disabled", () => {
  const missing = resolveHostControls({ home, exists: () => false })
  assert.equal(buildHostControlsPromptBlock(missing), "")
  assert.equal(buildSearchControlsPromptBlock(missing), "")

  const disabled = resolveHostControls({
    home,
    config: { disabled: true, browserScript: browserDiscovered },
    exists: () => true,
  })
  assert.equal(buildHostControlsPromptBlock(disabled), "")
  assert.equal(buildSearchControlsPromptBlock(disabled), "")
})

test("injects only existing helper paths into the agent prompt", () => {
  const resolved = resolveHostControls({
    home,
    exists: (path) => path === browserDiscovered || path === searchDiscovered,
  })
  const hostPrompt = buildHostControlsPromptBlock(resolved)
  assert.match(hostPrompt, /Verified host browser and computer-use controls/)
  assert.match(hostPrompt, /browser-control\.sh status/)
  assert.doesNotMatch(hostPrompt, /desktop-control\.sh/)
  assert.doesNotMatch(hostPrompt, /\/Users\/duckets\//)

  const searchPrompt = buildSearchControlsPromptBlock(resolved)
  assert.match(searchPrompt, /web-search-fallback\.sh search/)
})

test("rejects helper paths that contain shell metacharacters", () => {
  assert.equal(sanitizeHostHelperPath("  /safe/path.sh  "), "/safe/path.sh")
  assert.equal(sanitizeHostHelperPath(""), "")
  assert.throws(() => sanitizeHostHelperPath("/tmp/bad;rm -rf /"), /shell metacharacters/)
  assert.throws(() => sanitizeHostHelperPath("/tmp/$(id).sh"), /shell metacharacters/)
  assert.equal(sanitizeHostHelperPath("C:\\Tools\\browser.cmd"), "C:\\Tools\\browser.cmd")
})
