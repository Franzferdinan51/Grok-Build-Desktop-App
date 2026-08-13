import assert from "node:assert/strict"
import test from "node:test"
import { rewriteNvidiaObject, rewriteNvidiaSseBuffer, rewriteNvidiaSseEvent, ZERO_USAGE } from "./nvidia-stream-compat.ts"

test("rewriteNvidiaObject replaces null usage and drops NVIDIA extras", () => {
  const rewritten = rewriteNvidiaObject({
    id: "chunk",
    usage: null,
    nvext: { spec_decode: true },
    service_tier: null,
    system_fingerprint: null,
  }) as { usage: typeof ZERO_USAGE; nvext?: unknown; service_tier?: unknown }
  assert.deepEqual(rewritten.usage, ZERO_USAGE)
  assert.equal("nvext" in rewritten, false)
  assert.equal("service_tier" in rewritten, false)
})

test("rewriteNvidiaObject keeps a populated final usage object", () => {
  const usage = { prompt_tokens: 12, completion_tokens: 4, total_tokens: 16 }
  const rewritten = rewriteNvidiaObject({ usage }) as { usage: typeof usage }
  assert.deepEqual(rewritten.usage, usage)
})

test("rewriteNvidiaSseEvent rewrites data lines and leaves [DONE] alone", () => {
  const event = rewriteNvidiaSseEvent("data: {\"usage\":null,\"nvext\":1}\n")
  assert.match(event, /"prompt_tokens":0/)
  assert.doesNotMatch(event, /nvext/)
  assert.equal(rewriteNvidiaSseEvent("data: [DONE]\n").includes("[DONE]"), true)
})

test("rewriteNvidiaSseBuffer holds a partial trailing event", () => {
  const first = rewriteNvidiaSseBuffer("data: {\"usage\":null}\n\ndata: {\"id\"")
  assert.match(first.flushed, /prompt_tokens/)
  assert.equal(first.rest, "data: {\"id\"")
})
