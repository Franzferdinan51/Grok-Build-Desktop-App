import assert from "node:assert/strict"
import test from "node:test"
import { catalogModelOptions } from "./provider-availability.ts"
import {
  collapseFastFamilies,
  DEFAULT_VISIBLE_PER_PROVIDER,
  filterModelGroups,
  flattenModelOptions,
  hiddenModelCount,
  modelDisplayName,
  modelDisplayParts,
  modelPickerLabel,
} from "./model-picker.ts"

test("modelDisplayParts titles aliases the way Hermes titles model rows", () => {
  assert.deepEqual(modelDisplayParts("grok-4.6"), { name: "Grok 4.6", tag: "" })
  assert.deepEqual(modelDisplayParts("nemotron-3-ultra-550b"), { name: "Nemotron 3 Ultra 550B", tag: "NVIDIA" })
  assert.deepEqual(modelDisplayParts("minimax-m3-nvidia"), { name: "MiniMax M3", tag: "NVIDIA" })
  assert.deepEqual(modelDisplayParts("codex-gpt-5-6-sol"), { name: "GPT-5.6 Sol", tag: "" })
  assert.equal(modelDisplayName("minimax-m2-7-highspeed"), "MiniMax M2 7 · Highspeed")
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

test("collapseFastFamilies hides the -fast sibling unless it is selected", () => {
  const options = [
    { id: "grok-4.6", label: "grok-4.6", available: true, family: "xai" },
    { id: "grok-4.6-fast", label: "grok-4.6-fast", available: true, family: "xai" },
  ]
  assert.deepEqual(collapseFastFamilies(options).map((option) => option.id), ["grok-4.6"])
  assert.deepEqual(collapseFastFamilies(options, "grok-4.6-fast").map((option) => option.id), ["grok-4.6", "grok-4.6-fast"])
})

test("filterModelGroups caps each provider until the user searches", () => {
  const ids = Array.from({ length: DEFAULT_VISIBLE_PER_PROVIDER + 4 }, (_, index) => `grok-extra-${index}`)
  const options = catalogModelOptions(ids, [], undefined, [], ids)
  assert.equal(filterModelGroups(options, "").flatMap((group) => group.options).length, DEFAULT_VISIBLE_PER_PROVIDER)
  assert.equal(hiddenModelCount(options, ""), 4)
  assert.equal(filterModelGroups(options, "grok-extra").flatMap((group) => group.options).length, ids.length)
})
