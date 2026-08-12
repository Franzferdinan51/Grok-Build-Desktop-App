import assert from "node:assert/strict"
import test from "node:test"
import { lastUserInstruction, rewindLastTurn } from "./conversation-lifecycle.ts"

const message = (role: "user" | "assistant", content: string, id = role) => ({
  id,
  role,
  createdAt: 1,
  logs: [{ kind: "text", content }],
})

test("lastUserInstruction returns the most recent visible user turn", () => {
  assert.equal(lastUserInstruction([]), undefined)
  assert.equal(lastUserInstruction([
    message("user", "first", "u1"),
    message("assistant", "ok", "a1"),
    message("user", "  retry this  ", "u2"),
    message("assistant", "done", "a2"),
  ]), "retry this")
})

test("rewindLastTurn removes a completed user/assistant pair", () => {
  const messages = [message("user", "keep", "u1"), message("assistant", "ok", "a1"), message("user", "drop", "u2"), message("assistant", "gone", "a2")]
  const rewound = rewindLastTurn(messages)
  assert.deepEqual(rewound.remaining.map((entry) => entry.id), ["u1", "a1"])
  assert.deepEqual(rewound.removed.map((entry) => entry.id), ["u2", "a2"])
})

test("rewindLastTurn handles a trailing unanswered user turn", () => {
  const rewound = rewindLastTurn([message("user", "keep", "u1"), message("user", "oops", "u2")])
  assert.deepEqual(rewound.remaining.map((entry) => entry.id), ["u1"])
  assert.equal(rewound.removed[0]?.id, "u2")
})
