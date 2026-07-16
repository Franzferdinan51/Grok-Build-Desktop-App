import assert from "node:assert/strict"
import test from "node:test"
import { matchingSlashCommands, parseSlashCommand } from "./slash-commands.ts"

test("parses slash commands and arguments", () => {
  assert.deepEqual(parseSlashCommand("/model grok-code"), { name: "model", args: "grok-code" })
  assert.equal(parseSlashCommand("hello"), null)
})

test("filters the command palette", () => {
  assert.equal(matchingSlashCommands("/pre")[0]?.name, "preview")
  assert.equal(matchingSlashCommands("/lea").some((command) => command.name === "learn"), true)
  assert.equal(matchingSlashCommands("/model grok").length, 0)
})
