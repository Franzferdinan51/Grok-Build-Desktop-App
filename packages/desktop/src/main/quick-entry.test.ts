import test from "node:test"
import assert from "node:assert/strict"
import { isQuickEntryTarget, normalizeQuickEntryAccelerator, validateQuickEntryAccelerator } from "./quick-entry.ts"

test("normalizes common Quick Entry accelerator aliases", () => assert.equal(normalizeQuickEntryAccelerator("Ctrl + Shift + Space"), "Control+Shift+Space"))
test("requires a modifier and valid terminal key", () => {
  assert.throws(() => validateQuickEntryAccelerator("Space"), /modifier/)
  assert.throws(() => validateQuickEntryAccelerator("Control+"), /end with/)
  assert.equal(validateQuickEntryAccelerator("CommandOrControl+Shift+Space"), "CommandOrControl+Shift+Space")
})
test("accepts only supported Quick Entry targets", () => {
  assert.equal(isQuickEntryTarget("current"), true)
  assert.equal(isQuickEntryTarget("new"), true)
  assert.equal(isQuickEntryTarget("workspace"), false)
})
