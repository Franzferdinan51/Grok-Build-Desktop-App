import test from "node:test"
import assert from "node:assert/strict"
import { addDockedSessionId, MAX_DOCKED_SESSIONS, parseDockedSessionIds, removeDockedSessionId } from "./session-dock.ts"

test("parseDockedSessionIds accepts legacy single ids and caps persisted state", () => {
  assert.deepEqual(parseDockedSessionIds("one"), ["one"])
  assert.equal(parseDockedSessionIds(Array.from({ length: MAX_DOCKED_SESSIONS + 2 }, (_, index) => `s${index}`)).length, MAX_DOCKED_SESSIONS)
})

test("addDockedSessionId promotes an existing session without duplicates", () => {
  assert.deepEqual(addDockedSessionId(["a", "b"], "b"), ["b", "a"])
})

test("removeDockedSessionId closes only the requested session", () => {
  assert.deepEqual(removeDockedSessionId(["a", "b"], "a"), ["b"])
})
