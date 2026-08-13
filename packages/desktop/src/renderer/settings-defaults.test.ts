import assert from "node:assert/strict"
import test from "node:test"
import { ADVANCED_DEFAULTS, FRIENDLY_DEFAULTS, resolveFriendlyDefaults } from "./settings-defaults.ts"

test("friendly defaults keep coding sessions CLI-fast", () => {
  assert.equal(FRIENDLY_DEFAULTS.thinking, false)
  assert.equal(FRIENDLY_DEFAULTS.selfVerify, false)
  assert.equal(FRIENDLY_DEFAULTS.subagents, false)
  assert.equal(FRIENDLY_DEFAULTS.autoUpdate, true)
  assert.equal(FRIENDLY_DEFAULTS.webSearch, true)
  assert.equal(FRIENDLY_DEFAULTS.autoApprove, false)
  assert.equal(ADVANCED_DEFAULTS.permissionMode, "auto")
  assert.equal(ADVANCED_DEFAULTS.noPlan, true)
})

test("resolveFriendlyDefaults persists only missing keys", () => {
  const first = resolveFriendlyDefaults({})
  assert.equal(first.values.autoUpdate, true)
  assert.equal(first.values.thinking, false)
  assert.equal(first.persist.autoUpdate, true)
  assert.equal(first.persist.thinking, false)

  const existing = resolveFriendlyDefaults({ autoUpdate: false, thinking: true, subagents: true })
  assert.equal(existing.values.autoUpdate, false)
  assert.equal(existing.values.thinking, true)
  assert.equal(existing.values.subagents, true)
  assert.equal(existing.persist.autoUpdate, undefined)
  assert.equal(existing.persist.thinking, undefined)
})
