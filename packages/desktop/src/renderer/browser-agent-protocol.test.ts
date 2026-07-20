import test from "node:test"
import assert from "node:assert/strict"
import { BROWSER_AGENT_SYSTEM_PROMPT, parseBrowserDirective } from "./browser-agent-protocol.ts"

test("parses a structured browser action", () => {
  assert.deepEqual(parseBrowserDirective(JSON.stringify({ kind: "action", action: { type: "click", selector: "button[data-testid=reply]" } })), {
    kind: "action",
    action: { type: "click", selector: "button[data-testid=reply]" },
  })
})

test("parses a structured browser completion", () => {
  assert.deepEqual(parseBrowserDirective('{"kind":"done","summary":"Reply drafted but not posted."}'), {
    kind: "done",
    summary: "Reply drafted but not posted.",
  })
})

test("unwraps Grok CLI structured output", () => {
  const output = JSON.stringify({
    text: '{"kind":"action","action":{"type":"type","selector":"textarea[data-testid=reply]","text":"Nice update!"}}',
    stopReason: "EndTurn",
    structuredOutput: { kind: "action", action: { type: "type", selector: "textarea[data-testid=reply]", text: "Nice update!" } },
  })
  assert.deepEqual(parseBrowserDirective(output), {
    kind: "action",
    action: { type: "type", selector: "textarea[data-testid=reply]", text: "Nice update!" },
  })
})

test("recovers a directive from provider reasoning residue", () => {
  const output = JSON.stringify({
    text: '</think>\n\n{"kind":"action","action":{"type":"navigate","url":"https://x.com"}}',
    structuredOutput: null,
    structuredOutputError: "model output was not valid JSON",
  })
  assert.deepEqual(parseBrowserDirective(output), {
    kind: "action",
    action: { type: "navigate", url: "https://x.com" },
  })
})

test("uses the successful directive after retry error envelopes", () => {
  const output = [
    JSON.stringify({ type: "error", message: "serialization error: missing field created" }),
    JSON.stringify({ type: "error", message: "serialization error: missing field created" }),
    JSON.stringify({ structuredOutput: { kind: "action", action: { type: "navigate", url: "https://x.com" } } }, null, 2),
  ].join("\n")
  assert.deepEqual(parseBrowserDirective(output), {
    kind: "action",
    action: { type: "navigate", url: "https://x.com" },
  })
})

test("rejects leaked coding-agent narration", () => {
  const leaked = "Let me read the full prompt file first. Task completed. Grok Build applied the changes but returned no public summary."
  assert.equal(parseBrowserDirective(leaked), undefined)
  assert.match(BROWSER_AGENT_SYSTEM_PROMPT, /not a coding agent/i)
  assert.match(BROWSER_AGENT_SYSTEM_PROMPT, /Never.*workspace files/i)
})

test("keeps compatibility with legacy tagged directives", () => {
  assert.deepEqual(parseBrowserDirective('<browser_action>{"type":"scroll","pixels":850}</browser_action>'), {
    kind: "action",
    action: { type: "scroll", pixels: 850 },
  })
})
