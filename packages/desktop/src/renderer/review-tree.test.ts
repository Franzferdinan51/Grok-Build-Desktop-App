import assert from "node:assert/strict"
import test from "node:test"
import { countDiffLines, diffLineKind, reviewKind, reviewStatusLabel, summarizeReview, visibleReviewRows } from "./review-tree.ts"

test("reviewKind maps git porcelain status codes", () => {
  assert.equal(reviewKind("??"), "untracked")
  assert.equal(reviewKind("A"), "added")
  assert.equal(reviewKind(" M"), "modified")
  assert.equal(reviewKind("D"), "deleted")
  assert.equal(reviewKind("R"), "renamed")
  assert.equal(reviewStatusLabel("??"), "U")
})

test("summarizeReview counts kinds", () => {
  const summary = summarizeReview([
    { status: "M", path: "a.ts" },
    { status: "A", path: "b.ts" },
    { status: "??", path: "c.ts" },
    { status: "D", path: "d.ts" },
  ])
  assert.deepEqual(summary, { total: 4, added: 1, modified: 1, deleted: 1, untracked: 1, renamed: 0 })
})

test("visibleReviewRows supports tree and list modes", () => {
  const changes = [
    { status: "M", path: "src/main/ipc.ts" },
    { status: "??", path: "src/renderer/App.tsx" },
  ]
  const tree = visibleReviewRows(changes, "", new Set(["src"]), "tree")
  assert.ok(tree.some((row) => row.node.isDir && row.node.name === "src"))
  const list = visibleReviewRows(changes, "app", new Set(), "list")
  assert.equal(list.length, 1)
  assert.equal(list[0]?.node.name, "App.tsx")
  assert.equal(list[0]?.depth, 0)
})

test("diff line classification and counts ignore headers", () => {
  const diff = "--- a/file\n+++ b/file\n@@ -1,2 +1,3 @@\n context\n-removed\n+added\n+also\n"
  assert.equal(diffLineKind("+++ b/file"), "meta")
  assert.equal(diffLineKind("@@ -1,2 +1,3 @@"), "hunk")
  assert.equal(diffLineKind("+added"), "add")
  assert.equal(diffLineKind("-removed"), "del")
  assert.deepEqual(countDiffLines(diff), { added: 2, removed: 1 })
})
