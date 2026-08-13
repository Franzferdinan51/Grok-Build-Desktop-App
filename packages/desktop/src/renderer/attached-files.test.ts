import test from "node:test"
import assert from "node:assert/strict"
import { droppedWorkspaceFiles, formatAttachedPrompt, MAX_ATTACHED_FILES, toggleAttachedFile } from "./attached-files.ts"

const file = (path: string) => ({ path, size: 12 })

test("toggleAttachedFile adds and removes workspace files", () => {
  const first = toggleAttachedFile([], file("src/App.tsx"))
  assert.deepEqual(first.map((entry) => entry.path), ["src/App.tsx"])
  assert.deepEqual(toggleAttachedFile(first, file("src/App.tsx")), [])
})

test("toggleAttachedFile caps attachments without dropping existing context", () => {
  const current = Array.from({ length: MAX_ATTACHED_FILES }, (_, index) => file(`src/${index}.ts`))
  const next = toggleAttachedFile(current, file("src/overflow.ts"))
  assert.equal(next.length, MAX_ATTACHED_FILES)
  assert.equal(next.at(-1)?.path, `src/${MAX_ATTACHED_FILES - 1}.ts`)
})

test("formatAttachedPrompt keeps the instruction and adds readable file context", () => {
  assert.equal(formatAttachedPrompt("Fix this", [file("src/App.tsx"), file("README.md")]), "Fix this\n\n[Workspace files attached for context]\n- src/App.tsx\n- README.md\nRead the attached workspace files before acting; they are context for the instruction below.")
  assert.equal(formatAttachedPrompt("  Fix this  ", []), "Fix this")
})

test("droppedWorkspaceFiles accepts only known files inside the workspace", () => {
  const files = [file("src/App.tsx"), file("README.md")]
  assert.deepEqual(
    droppedWorkspaceFiles("/workspace/project", ["/workspace/project/src/App.tsx", "/tmp/secret.txt", "/workspace/project/unknown.ts"], files),
    [file("src/App.tsx")],
  )
})

test("droppedWorkspaceFiles deduplicates paths and respects the attachment cap", () => {
  const files = Array.from({ length: MAX_ATTACHED_FILES }, (_, index) => file(`src/${index}.ts`))
  const dropped = files.flatMap((entry) => [`/workspace/project/${entry.path}`, `/workspace/project/${entry.path}`])
  assert.deepEqual(droppedWorkspaceFiles("/workspace/project", dropped, files, MAX_ATTACHED_FILES - 2).map((entry) => entry.path), ["src/0.ts", "src/1.ts"])
})
