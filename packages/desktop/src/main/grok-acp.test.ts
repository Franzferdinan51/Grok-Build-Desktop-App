import assert from "node:assert/strict"
import test from "node:test"
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { permissionResponse, runGrokAcp, subagentEventFromMessage } from "./grok-acp.ts"

test("ACP permissions fail closed outside bypass mode", () => {
  assert.deepEqual(permissionResponse("default", [{ optionId: "allow", kind: "allow_once" }]), { outcome: { outcome: "cancelled" } })
  assert.deepEqual(permissionResponse("bypassPermissions", [{ optionId: "allow", kind: "allow_once" }]), { outcome: { outcome: "selected", optionId: "allow" } })
})

test("ACP maps Grok subagent lifecycle notifications", () => {
  const started = subagentEventFromMessage({ method: "x.ai/session_notification", params: { update: { sessionUpdate: "subagent_spawned", subagent_id: "sub-1", description: "Review tests" } } })
  assert.equal(started?.id, "sub-1")
  assert.equal(started?.status, "running")
  assert.equal(started?.label, "Review tests")
  const finished = subagentEventFromMessage({ method: "_x.ai/session_notification", params: { params: { update: { sessionUpdate: "subagent_finished", subagent_id: "sub-1", duration_ms: 800, turns: 2 } } } })
  assert.equal(finished?.id, "sub-1")
  assert.equal(finished?.status, "completed")
  assert.equal(finished?.durationMs, 800)
  assert.equal(finished?.turns, 2)
})

test("ACP rejects a missing Grok executable cleanly", async () => {
  await assert.rejects(runGrokAcp("hello", { cli: "/definitely-not-a-grok-binary", cwd: "/tmp" }), /Grok ACP|spawn|ENOENT|exited/)
})

test("ACP rejects an already-aborted turn", async () => {
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(runGrokAcp("hello", { cli: "grok", cwd: "/tmp", signal: controller.signal }), /aborted/)
})

test("ACP waits for a renderer permission choice and resumes the prompt", async () => {
  const root = await mkdtemp(join(tmpdir(), "grok-acp-permission-"))
  const fixture = join(root, "fixture.mjs")
  const wrapper = join(root, process.platform === "win32" ? "grok-fixture.cmd" : "grok-fixture")
  await writeFile(fixture, `import readline from "node:readline"\nconst rl = readline.createInterface({ input: process.stdin })\nconst send = (message) => process.stdout.write(JSON.stringify(message) + "\\n")\nrl.on("line", (line) => {\n  const message = JSON.parse(line)\n  if (message.method === "initialize") send({ jsonrpc: "2.0", id: message.id, result: { authMethods: [{ id: "cached_token" }] } })\n  else if (message.method === "authenticate") send({ jsonrpc: "2.0", id: message.id, result: {} })\n  else if (message.method === "session/new") send({ jsonrpc: "2.0", id: message.id, result: { sessionId: "fixture-session" } })\n  else if (message.method === "session/prompt") {\n    send({ jsonrpc: "2.0", id: 77, method: "session/request_permission", params: { title: "Write the requested file?", options: [{ optionId: "allow-once", name: "Allow once", kind: "allow_once", description: "Permit this write" }, { optionId: "deny", name: "Deny", kind: "reject_once" }] } })\n    rl.once("line", (responseLine) => {\n      const response = JSON.parse(responseLine)\n      if (response.id === 77 && response.result?.outcome?.outcome === "selected") {\n        send({ jsonrpc: "2.0", method: "session/update", params: { update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "resumed" } } } })\n        send({ jsonrpc: "2.0", id: message.id, result: { stopReason: "end_turn" } })\n      }\n    })\n  }\n})\n`)
  await writeFile(wrapper, process.platform === "win32" ? `@echo off\r\n"${process.execPath}" "${fixture}" %*\r\n` : `#!/bin/sh\nexec "${process.execPath}" "${fixture}" "$@"\n`)
  if (process.platform !== "win32") await chmod(wrapper, 0o755)
  try {
    let seen = false
    const result = await runGrokAcp("write a file", { cli: wrapper, cwd: root }, {
      onPermissionRequest: async (request) => {
        seen = request.title === "Write the requested file?" && request.options.length === 2
        return { outcome: { outcome: "selected", optionId: "allow-once" } }
      },
    })
    assert.equal(seen, true)
    assert.equal(result.text, "resumed")
    assert.equal(result.sessionId, "fixture-session")
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
  }
})
