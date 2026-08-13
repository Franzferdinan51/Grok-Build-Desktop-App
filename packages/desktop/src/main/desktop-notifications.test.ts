import test from "node:test"
import assert from "node:assert/strict"
import { normalizeDesktopNotification } from "./desktop-notifications.ts"

test("normalizeDesktopNotification accepts bounded completion payloads", () => {
  assert.deepEqual(normalizeDesktopNotification({ kind: "success", title: " Done ", body: " Finished " }), { kind: "success", title: "Done", body: "Finished" })
})

test("normalizeDesktopNotification rejects incomplete or unknown payloads", () => {
  assert.equal(normalizeDesktopNotification({ kind: "info", title: "x", body: "y" } as never), null)
  assert.equal(normalizeDesktopNotification({ kind: "error", title: "", body: "failure" }), null)
})

test("normalizeDesktopNotification bounds title and body length", () => {
  const result = normalizeDesktopNotification({ kind: "error", title: "x".repeat(200), body: "y".repeat(1000) })!
  assert.equal(result.title.length, 120)
  assert.equal(result.body.length, 600)
})

