import assert from "node:assert/strict"
import test from "node:test"
import { classifyBackendError, normalizeBackendStderr } from "./backend-error.ts"

test("classifyBackendError marks provider rate limits as retryable", () => {
  const classified = classifyBackendError("Telegram or provider rate-limited (HTTP 429)")
  assert.equal(classified.class, "rate_limit")
  assert.equal(classified.retryable, true)
  assert.match(classified.userMessage, /rate-limited/i)
})

test("classifyBackendError keeps authentication failures from looking retryable", () => {
  const classified = classifyBackendError("unauthorized: expired oauth token")
  assert.equal(classified.class, "authentication")
  assert.equal(classified.retryable, false)
})

test("classifyBackendError treats malformed streaming events as retryable serialization failures", () => {
  const classified = classifyBackendError("serialization error: invalid type: null")
  assert.equal(classified.class, "serialization")
  assert.equal(classified.retryable, true)
  assert.match(classified.userMessage, /malformed streaming event/)
})

test("classifyBackendError names the NVIDIA NIM usage:null failure", () => {
  const classified = classifyBackendError("serialization error: invalid type: null, expected u32 at line 1 column 319")
  assert.match(classified.userMessage, /NVIDIA NIM/)
})

test("normalizeBackendStderr still extracts the human message from Internal error dumps", () => {
  assert.equal(normalizeBackendStderr('Internal error: {"message":"serialization error: null"}'), "serialization error: null")
})
