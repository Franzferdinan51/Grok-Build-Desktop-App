import assert from "node:assert/strict"
import test from "node:test"
import { permissionResponse, runGrokAcp } from "./grok-acp.ts"

test("ACP permissions fail closed outside bypass mode", () => {
  assert.deepEqual(permissionResponse("default", [{ optionId: "allow", kind: "allow_once" }]), { outcome: { outcome: "cancelled" } })
  assert.deepEqual(permissionResponse("bypassPermissions", [{ optionId: "allow", kind: "allow_once" }]), { outcome: { outcome: "selected", optionId: "allow" } })
})

test("ACP rejects a missing Grok executable cleanly", async () => {
  await assert.rejects(runGrokAcp("hello", { cli: "/definitely-not-a-grok-binary", cwd: "/tmp" }), /Grok ACP|spawn|ENOENT|exited/)
})

test("ACP rejects an already-aborted turn", async () => {
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(runGrokAcp("hello", { cli: "grok", cwd: "/tmp", signal: controller.signal }), /aborted/)
})
