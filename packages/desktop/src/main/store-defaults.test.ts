import assert from "node:assert/strict"
import test from "node:test"
import { encryptedTelegramTokenPresent, storeArray, storeTelegram, telegramTokenFailureMessage } from "./store-defaults.ts"

test("storeArray never returns undefined for projects/schedules", () => {
  assert.deepEqual(storeArray(undefined), [])
  assert.deepEqual(storeArray(null), [])
  assert.deepEqual(storeArray([{ id: "1" }]), [{ id: "1" }])
})

test("storeTelegram fills a missing section so status probes cannot crash", () => {
  assert.deepEqual(storeTelegram(undefined), { allowedChatIds: [], pendingChatIds: [] })
  assert.equal(storeTelegram({ token: "x", allowedChatIds: ["1"] }).token, "x")
})

test("token failure copy distinguishes missing, locked, and undecryptable", () => {
  assert.equal(telegramTokenFailureMessage({ hasEncrypted: false, encryptionAvailable: true, decrypted: false }), "")
  assert.match(telegramTokenFailureMessage({ hasEncrypted: true, encryptionAvailable: false, decrypted: false }), /keychain/i)
  assert.match(telegramTokenFailureMessage({ hasEncrypted: true, encryptionAvailable: true, decrypted: false }), /cannot be decrypted/)
  assert.equal(telegramTokenFailureMessage({ hasEncrypted: true, encryptionAvailable: true, decrypted: true }), "")
  assert.equal(encryptedTelegramTokenPresent({ token: "abc" }), true)
  assert.equal(encryptedTelegramTokenPresent({}), false)
})
