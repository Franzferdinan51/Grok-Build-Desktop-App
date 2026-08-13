import assert from "node:assert/strict"
import test from "node:test"
import { parseGrokSubcommands, parseGrokSubcommandNames } from "./grok-subcommands.ts"

test("parseGrokSubcommands exposes the documented CLI catalog", () => {
  const help = `Commands:\n  models        List available models\n  sessions      Manage sessions\n  dashboard     Open the dashboard\n\nOptions:\n  -h, --help    Print help\n`
  assert.deepEqual(parseGrokSubcommands(help), [
    { name: "models", description: "List available models" },
    { name: "sessions", description: "Manage sessions" },
    { name: "dashboard", description: "Open the dashboard" },
  ])
  assert.deepEqual(parseGrokSubcommandNames(help), ["models", "sessions", "dashboard"])
})

test("parseGrokSubcommands safely returns no catalog for malformed help", () => {
  assert.deepEqual(parseGrokSubcommands("Grok Build\nOptions:\n  --help"), [])
})
