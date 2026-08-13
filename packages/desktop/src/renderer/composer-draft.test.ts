import assert from "node:assert/strict"
import test from "node:test"
import { composeDraftSnapshot, composerDraftIsEmpty, parseComposerDraft } from "./composer-draft.ts"

test("parseComposerDraft rejects malformed snapshots and keeps valid ones", () => {
  assert.deepEqual(parseComposerDraft(null), { text: "", attachments: [] })
  assert.deepEqual(parseComposerDraft({ text: 1, attachments: [{ path: 2 }] }), { text: "", attachments: [] })
  const restored = parseComposerDraft({ text: "fix the parser", attachments: [{ path: " src/App.tsx ", size: 12 }] })
  assert.equal(restored.text, "fix the parser")
  assert.deepEqual(restored.attachments, [{ path: "src/App.tsx", size: 12 }])
})

test("composeDraftSnapshot and emptiness follow the same persist rules as the queue", () => {
  assert.equal(composerDraftIsEmpty(composeDraftSnapshot("   ", [])), true)
  const snapshot = composeDraftSnapshot("keep this", [{ path: "README.md", size: 4 }])
  assert.equal(composerDraftIsEmpty(snapshot), false)
  assert.equal(snapshot.attachments[0]?.path, "README.md")
})
