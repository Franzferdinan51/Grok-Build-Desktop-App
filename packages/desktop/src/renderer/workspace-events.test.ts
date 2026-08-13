import assert from "node:assert/strict"
import test from "node:test"
import { createWorkspaceRefreshScheduler, streamingEventMayMutateWorkspace, toolChangedPath, toolMayMutateFiles } from "./workspace-events.ts"

test("toolMayMutateFiles ignores read-only tools and matches writers", () => {
  assert.equal(toolMayMutateFiles({ name: "read_file" }), false)
  assert.equal(toolMayMutateFiles({ name: "search_files" }), false)
  assert.equal(toolMayMutateFiles({ name: "write_file" }), true)
  assert.equal(toolMayMutateFiles({ tool: "bash" }), true)
  assert.equal(toolMayMutateFiles({ name: "read_file", inline_diff: "--- a\n+++ b\n" }), true)
})

test("toolChangedPath reads common single-file writer args", () => {
  assert.equal(toolChangedPath({ args: { path: "/tmp/src/App.tsx" } }), "/tmp/src/App.tsx")
  assert.equal(toolChangedPath({ arguments: { file_path: "README.md" } }), "README.md")
  assert.equal(toolChangedPath({ args: { command: "ls" } }), undefined)
})

test("streamingEventMayMutateWorkspace only reacts to tool/phase mutations", () => {
  assert.equal(streamingEventMayMutateWorkspace({ type: "text", data: "hello" }), false)
  assert.equal(streamingEventMayMutateWorkspace({ type: "thought", data: "planning" }), false)
  assert.equal(streamingEventMayMutateWorkspace({ type: "phase", phase: "starting" }), false)
  assert.equal(streamingEventMayMutateWorkspace({ type: "phase", phase: "executing" }), false)
  assert.equal(streamingEventMayMutateWorkspace({ type: "phase", phase: "completed" }), true)
  assert.equal(streamingEventMayMutateWorkspace({ type: "tool", name: "read_file" }), false)
  assert.equal(streamingEventMayMutateWorkspace({ type: "tool_use", name: "apply_patch" }), true)
  assert.equal(streamingEventMayMutateWorkspace({ type: "tool_result", tool: "shell" }), true)
})

test("createWorkspaceRefreshScheduler fires immediately then coalesces a burst", async () => {
  let count = 0
  const scheduler = createWorkspaceRefreshScheduler(() => { count += 1 }, 20)
  scheduler.notify()
  scheduler.notify()
  assert.equal(count, 1)
  await new Promise((resolve) => setTimeout(resolve, 30))
  assert.equal(count, 2)
  scheduler.dispose()
})
