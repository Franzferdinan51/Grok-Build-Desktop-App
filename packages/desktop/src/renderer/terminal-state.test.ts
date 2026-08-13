import assert from "node:assert/strict"
import test from "node:test"
import { addTerminalHistory, browseTerminalHistory, MAX_TERMINAL_HISTORY, parseTerminalSnapshot, terminalStateKey } from "./terminal-state.ts"

test("terminal snapshots remain bounded and discard malformed entries", () => {
  const snapshot = parseTerminalSnapshot({ output: "x".repeat(210_000), history: [" pnpm test ", 4, "git status"] })
  assert.equal(snapshot.output.length, 200_000)
  assert.deepEqual(snapshot.history, ["pnpm test", "git status"])
})

test("terminal history deduplicates newest commands and caps entries", () => {
  const history = addTerminalHistory(["git status", "pnpm test"], " git status ")
  assert.deepEqual(history, ["git status", "pnpm test"])
  assert.equal(addTerminalHistory(Array.from({ length: 60 }, (_, index) => `cmd-${index}`), "new").length, MAX_TERMINAL_HISTORY)
})

test("terminal history browsing moves backward and returns to a blank prompt", () => {
  const history = ["git status", "pnpm test"]
  assert.deepEqual(browseTerminalHistory(history, -1, -1), { index: 0, command: "git status" })
  assert.deepEqual(browseTerminalHistory(history, 0, -1), { index: 1, command: "pnpm test" })
  assert.deepEqual(browseTerminalHistory(history, 0, 1), { index: -1, command: "" })
})

test("terminal snapshots are namespaced by workspace", () => {
  assert.equal(terminalStateKey("/tmp/a") !== terminalStateKey("/tmp/b"), true)
})
