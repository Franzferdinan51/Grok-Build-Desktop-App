import assert from "node:assert/strict"
import test from "node:test"
import { buildManagedModelsBlock, DESKTOP_NIM_ALIAS } from "./model-config-block.ts"

test("managed provider tables use official model= not model_name", () => {
  const block = buildManagedModelsBlock(
    [{ id: "nvidia-build", label: "NVIDIA Build / NIM", envKey: "NVIDIA_API_KEY", baseUrl: "https://integrate.api.nvidia.com/v1" }],
    { "nvidia-build": { baseUrl: "https://integrate.api.nvidia.com/v1", modelId: "nvidia/nemotron-3-ultra-550b-a55b" } },
    null,
  )
  assert.match(block, /\[model\.nvidia-build-nvidia-nemotron-3-ultra-550b-a55b\]/)
  assert.match(block, /model = "nvidia\/nemotron-3-ultra-550b-a55b"/)
  assert.doesNotMatch(block, /model_name/)
})

test("NIM compatibility extras are valid Grok Build model tables", () => {
  const block = buildManagedModelsBlock([], {}, null, [{
    alias: DESKTOP_NIM_ALIAS,
    model: "nvidia/nemotron-3-ultra-550b-a55b",
    baseUrl: "http://127.0.0.1:18800/v1",
    name: "NVIDIA NIM compatibility",
    envKey: "NVIDIA_API_KEY",
  }])
  assert.match(block, /\[model\.gb-desktop-nim\]/)
  assert.match(block, /base_url = "http:\/\/127.0.0.1:18800\/v1"/)
})
