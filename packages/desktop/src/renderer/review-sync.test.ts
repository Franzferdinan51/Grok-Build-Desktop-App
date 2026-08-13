import test from "node:test"
import assert from "node:assert/strict"
import { preservedReviewPath } from "./review-sync.ts"

const changes = [{ path: "src/App.tsx", status: " M" }, { path: "README.md", status: "??" }]

test("preservedReviewPath keeps a selected file that remains changed", () => {
  assert.equal(preservedReviewPath(changes, "src/App.tsx"), "src/App.tsx")
})

test("preservedReviewPath clears a selection when the file is no longer changed", () => {
  assert.equal(preservedReviewPath(changes, "src/removed.ts"), "")
})
