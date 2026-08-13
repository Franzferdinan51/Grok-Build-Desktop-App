import assert from "node:assert/strict"
import test from "node:test"
import { catalogModelOptions } from "./provider-availability.ts"
import { filterModelGroups, flattenModelOptions, modelDisplayName, modelPickerLabel } from "./model-picker.ts"

test("modelDisplayName titles aliases and marks NVIDIA NIM hosts", () => {
  assert.equal(modelDisplayName("nemotron-3-ultra-550b"), "Nemotron 3 Ultra 550B · NVIDIA")
  assert.equal(modelDisplayName("minimax-m3-nvidia"), "Minimax M3 · NVIDIA")
  assert.equal(modelDisplayName("grok-4.6"), "Grok 4.6")
  assert.equal(modelPickerLabel("", "Grok Build default"), "Grok Build default")
})

test("filterModelGroups searches id, display name, and family", () => {
  const options = catalogModelOptions(
    ["grok-4.6", "nemotron-3-ultra-550b", "minimax-m3-nvidia", "MiniMax-M2.7"],
    [],
    "grok-4.6",
    [],
    ["grok-4.6", "nemotron-3-ultra-550b", "minimax-m3-nvidia", "MiniMax-M2.7"],
  )
  const nvidia = filterModelGroups(options, "nvidia")
  assert.deepEqual(nvidia.map((group) => group.family), ["nvidia"])
  assert.equal(flattenModelOptions(nvidia).length, 2)
  assert.equal(filterModelGroups(options, "ultra")[0]?.options[0]?.id, "nemotron-3-ultra-550b")
})
