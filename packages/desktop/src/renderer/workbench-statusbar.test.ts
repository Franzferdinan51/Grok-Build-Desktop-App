import test from "node:test"
import assert from "node:assert/strict"
import { workbenchWorkspaceLabel } from "./workbench-statusbar-model.ts"

test("workbenchWorkspaceLabel keeps the useful final workspace segment", () => {
  assert.equal(workbenchWorkspaceLabel("/Users/duckets/Projects/Grok"), "Grok")
  assert.equal(workbenchWorkspaceLabel("C:\\Projects\\Grok"), "Grok")
  assert.equal(workbenchWorkspaceLabel(""), "Scratch")
})
