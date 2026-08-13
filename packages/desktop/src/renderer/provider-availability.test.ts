import assert from "node:assert/strict"
import test from "node:test"
import { catalogModelOptions, groupedModelOptions, providerFamily, providerFamilyLabel } from "./provider-availability.ts"

test("providerFamily classifies known Grok Build model ids", () => {
  assert.equal(providerFamily("grok-4.5"), "xai")
  assert.equal(providerFamily("codex-gpt-5"), "openai")
  assert.equal(providerFamily("nvidia/nemotron-3-ultra-550b"), "nvidia")
  assert.equal(providerFamily("MiniMax-M2.7"), "minimax")
})

test("catalogModelOptions marks xAI and configured secrets available", () => {
  const options = catalogModelOptions(
    ["grok-4.5", "codex-gpt-5", "nvidia/nemotron-3-ultra-550b"],
    [{ id: "openai", label: "OpenAI", modelId: "codex-gpt-5", configured: true }],
    "grok-4.5",
  )
  assert.equal(options.find((option) => option.id === "grok-4.5")?.available, true)
  assert.equal(options.find((option) => option.id === "grok-4.5")?.label, "grok-4.5 (default)")
  assert.equal(options.find((option) => option.id === "codex-gpt-5")?.available, true)
  assert.equal(options.find((option) => option.id === "nvidia/nemotron-3-ultra-550b")?.available, false)
  assert.match(options.find((option) => option.id === "nvidia/nemotron-3-ultra-550b")?.reason || "", /Configure nvidia/)
})

test("catalogModelOptions treats OAuth-signed families as available", () => {
  const options = catalogModelOptions(["MiniMax-M2.7", "codex-gpt-5"], [], undefined, ["minimax"])
  assert.equal(options.find((option) => option.id === "MiniMax-M2.7")?.available, true)
  assert.equal(options.find((option) => option.id === "codex-gpt-5")?.available, false)
})

test("groupedModelOptions splits the picker by provider family", () => {
  const groups = groupedModelOptions(catalogModelOptions(
    ["grok-4.5", "codex-gpt-5", "MiniMax-M2.7", "nvidia/nemotron-3-ultra-550b"],
    [],
    "grok-4.5",
  ))
  assert.deepEqual(groups.map((group) => group.family), ["xai", "openai", "minimax", "nvidia"])
  assert.equal(providerFamilyLabel("xai"), "xAI / Grok")
  assert.equal(groups[0]?.options[0]?.id, "grok-4.5")
})
