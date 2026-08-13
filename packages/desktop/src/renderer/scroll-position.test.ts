import test from "node:test"
import assert from "node:assert/strict"
import { isNearBottom } from "./scroll-position.ts"

test("recognizes a transcript that is near the latest message", () => {
  assert.equal(isNearBottom(1000, 805, 180), true)
  assert.equal(isNearBottom(1000, 700, 180), false)
})

test("uses a bounded threshold for exact bottom checks", () => {
  assert.equal(isNearBottom(1000, 800, 200, 0), false)
  assert.equal(isNearBottom(1000, 800, 200, 1), true)
})
