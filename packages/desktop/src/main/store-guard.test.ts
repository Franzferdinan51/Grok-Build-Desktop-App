import assert from "node:assert/strict"
import test from "node:test"
import { isRendererForbiddenStoreKey } from "./store-guard.ts"

test("renderer cannot read or plant Telegram token paths", () => {
  assert.equal(isRendererForbiddenStoreKey("telegram"), true)
  assert.equal(isRendererForbiddenStoreKey("telegram.token"), true)
  assert.equal(isRendererForbiddenStoreKey("telegram.sessions"), true)
  assert.equal(isRendererForbiddenStoreKey("defaults.model"), false)
  assert.equal(isRendererForbiddenStoreKey("memory.telegramEnabled"), false)
})
