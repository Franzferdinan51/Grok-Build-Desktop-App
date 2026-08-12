import assert from "node:assert/strict"
import test from "node:test"
import { buildProjectFileTree } from "./project-file-tree.ts"

test("buildProjectFileTree groups nested paths and sorts folders first", () => {
  const tree = buildProjectFileTree([{ path: "src/main.ts", size: 20 }, { path: "README.md", size: 10 }, { path: "src/renderer/App.tsx", size: 30 }, { path: "package.json", size: 40 }])
  assert.deepEqual(tree.map((node) => `${node.kind}:${node.name}`), ["folder:src", "file:package.json", "file:README.md"])
  assert.deepEqual(tree[0].children.map((node) => node.path), ["src/renderer", "src/main.ts"])
  assert.equal(tree[0].children[0].children[0].path, "src/renderer/App.tsx")
})

test("buildProjectFileTree ignores empty path segments", () => {
  const tree = buildProjectFileTree([{ path: "/src//index.ts", size: 1 }])
  assert.equal(tree[0].path, "src")
  assert.equal(tree[0].children[0].path, "/src//index.ts")
})
