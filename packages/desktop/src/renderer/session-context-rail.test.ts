import test from "node:test"
import assert from "node:assert/strict"
import { nextSessionRail } from "./session-context-rail.ts"

test("activates one rail and closes it when selected again", () => {
  assert.equal(nextSessionRail(null, "files"), "files")
  assert.equal(nextSessionRail("files", "terminal"), "terminal")
  assert.equal(nextSessionRail("terminal", "terminal"), null)
})

test("unavailable rails leave the current context untouched", () => {
  assert.equal(nextSessionRail(null, "preview", false), null)
  assert.equal(nextSessionRail("files", "preview", false), "files")
})
