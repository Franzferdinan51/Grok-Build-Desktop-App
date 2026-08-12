import assert from "node:assert/strict"
import test from "node:test"
import { buildPaletteItems, filterPaletteItems } from "./command-palette.ts"

test("buildPaletteItems includes slash commands, views, chats, and models", () => {
  const items = buildPaletteItems({
    commands: [{ name: "retry", description: "Rerun the previous instruction" }],
    views: [{ id: "settings", label: "Settings" }],
    chats: [{ id: "c1", title: "Fix parser" }, { id: "empty", title: "   " }],
    models: ["grok-4.5"],
  })
  assert.equal(items.some((item) => item.id === "command:retry"), true)
  assert.equal(items.some((item) => item.id === "view:settings"), true)
  assert.equal(items.some((item) => item.id === "chat:c1"), true)
  assert.equal(items.some((item) => item.id === "chat:empty"), false)
  assert.equal(items.some((item) => item.id === "model:grok-4.5"), true)
})

test("filterPaletteItems is case-insensitive and capped", () => {
  const items = buildPaletteItems({
    commands: [{ name: "export", description: "Save Markdown" }],
    views: [{ id: "runs", label: "Grok runs" }],
    chats: [],
    models: Array.from({ length: 30 }, (_, index) => `model-${index}`),
  })
  assert.equal(filterPaletteItems(items, "EXPORT")[0]?.id, "command:export")
  assert.ok(filterPaletteItems(items, "").length <= 20)
})
