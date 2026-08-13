import assert from "node:assert/strict"
import test from "node:test"
import { ancestorIds, buildPathTree, filterByPath, firstLevelDirIds, flattenPathTree } from "./path-tree.ts"

test("buildPathTree compact-collapses single-child directory chains", () => {
  const tree = buildPathTree([
    { path: "src/renderer/views/WorkspacePanel.tsx", data: 1 },
    { path: "src/renderer/App.tsx", data: 2 },
    { path: "README.md", data: 3 },
  ])
  const readme = tree.find((node) => node.name === "README.md")
  assert.equal(readme?.isDir, false)
  const src = tree.find((node) => node.name === "src/renderer")
  assert.ok(src?.isDir)
  assert.deepEqual(src?.children?.map((child) => child.name), ["views", "App.tsx"])
})

test("flattenPathTree respects expanded folder ids", () => {
  const tree = buildPathTree([
    { path: "packages/desktop/src/main/ipc.ts", data: true },
    { path: "packages/desktop/package.json", data: true },
  ])
  const collapsed = flattenPathTree(tree, new Set())
  assert.equal(collapsed.length, 1)
  assert.equal(collapsed[0]?.node.name, "packages/desktop")
  const expanded = flattenPathTree(tree, new Set(["packages/desktop"]))
  assert.ok(expanded.some((row) => row.node.name === "src/main"))
  assert.ok(expanded.some((row) => row.node.name === "package.json"))
})

test("filterByPath and ancestor helpers", () => {
  const files = [{ path: "src/App.tsx" }, { path: "docs/README.md" }]
  assert.deepEqual(filterByPath(files, "app"), [{ path: "src/App.tsx" }])
  assert.deepEqual(ancestorIds("src/renderer/App.tsx"), ["src", "src/renderer"])
  assert.deepEqual(firstLevelDirIds(buildPathTree(files.map((file) => ({ ...file, data: true })))).sort(), ["docs", "src"])
})
