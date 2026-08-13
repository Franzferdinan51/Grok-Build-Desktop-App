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
  assert.equal(matchingSlashCommands("/ret")[0]?.name, "retry")
  assert.equal(matchingSlashCommands("/und")[0]?.name, "undo")
  assert.equal(matchingSlashCommands("/rew").some((command) => command.name === "undo"), true)
  assert.equal(matchingSlashCommands("/exp")[0]?.name, "export")
  assert.equal(matchingSlashCommands("/que")[0]?.name, "queue")
  assert.equal(matchingSlashCommands("/pla")[0]?.name, "plan")
  assert.equal(matchingSlashCommands("/view-p")[0]?.name, "view-plan")
  assert.equal(matchingSlashCommands("/deep")[0]?.name, "deep-research")
  assert.equal(matchingSlashCommands("/dash")[0]?.name, "dashboard")
  assert.equal(matchingSlashCommands("/model grok").length, 0)
})
