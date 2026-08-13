import assert from "node:assert/strict"
import test from "node:test"
import { isNvidiaHost, isNvidiaModelId, needsNvidiaStreamCompat, parseGrokModelTables, resolveNvidiaUpstream } from "./grok-model-tables.ts"

const sample = `
[model.nemotron-3-ultra-550b]
model = "nvidia/nemotron-3-ultra-550b-a55b"
base_url = "https://integrate.api.nvidia.com/v1"
api_key = "nvapi-test-not-a-real-key"
context_window = 1000000

[model.minimax-m3]
model = "MiniMax-M3"
base_url = "https://api.minimax.io/v1"
`

test("isNvidiaModelId recognizes NIM aliases, not MiniMax-native ids", () => {
  assert.equal(isNvidiaModelId("nemotron-3-ultra-550b"), true)
  assert.equal(isNvidiaModelId("minimax-m3-nvidia"), true)
  assert.equal(isNvidiaModelId("nvidia-build"), true)
  assert.equal(isNvidiaModelId("MiniMax-M3"), false)
})

test("parseGrokModelTables reads official model= tables", () => {
  const tables = parseGrokModelTables(sample)
  assert.equal(tables[0]?.id, "nemotron-3-ultra-550b")
  assert.equal(tables[0]?.model, "nvidia/nemotron-3-ultra-550b-a55b")
  assert.equal(isNvidiaHost(tables[0]?.baseUrl || ""), true)
  assert.equal(needsNvidiaStreamCompat("nemotron-3-ultra-550b", tables), true)
  assert.equal(needsNvidiaStreamCompat("minimax-m3", tables), false)
  assert.equal(resolveNvidiaUpstream("nemotron-3-ultra-550b", tables).model, "nvidia/nemotron-3-ultra-550b-a55b")
})
