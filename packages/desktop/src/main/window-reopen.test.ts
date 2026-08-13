import assert from "node:assert/strict"
import test from "node:test"
import { classifyWindow, shouldRecreateWorkbench } from "./window-reopen.ts"

test("Quick Entry and destroyed windows are not the workbench", () => {
  assert.equal(classifyWindow({ title: "Grok Build Quick Entry", skipTaskbar: true })?.kind, "utility")
  assert.equal(classifyWindow({ destroyed: true, title: "Grok Build Desktop" }), null)
  assert.equal(classifyWindow({ title: "Grok Build Desktop" })?.kind, "workbench")
})

test("closing the workbench while Quick Entry stays hidden still requires a new window", () => {
  assert.equal(shouldRecreateWorkbench([{ title: "Grok Build Quick Entry", skipTaskbar: true }]), true)
  assert.equal(shouldRecreateWorkbench([{ title: "Grok Build Desktop" }, { title: "Grok Build Quick Entry", skipTaskbar: true }]), false)
  assert.equal(shouldRecreateWorkbench([]), true)
})
