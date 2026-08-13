import assert from "node:assert/strict"
import test from "node:test"
import { StreamingJsonParser, extractJsonObjects, looksLikeIncompleteJson, parseStreamLine } from "./streaming-json.ts"

test("parseStreamLine reads a Grok Build streaming-json event and aliases session_id", () => {
  const [event] = parseStreamLine(`{"type":"text","data":"hello","session_id":"sess-1"}`)
  assert.equal(event?.type, "text")
  assert.equal(event?.data, "hello")
  assert.equal(event?.sessionId, "sess-1")
})

test("parseStreamLine accepts SSE data: prefixes used by some provider bridges", () => {
  const [event] = parseStreamLine(`data: {"type":"thought","data":"planning"}`)
  assert.equal(event?.type, "thought")
  assert.equal(event?.data, "planning")
})

test("parseStreamLine preserves typed backend phase metadata", () => {
  const [event] = parseStreamLine(`{"type":"phase","phase":"recovering","data":"restoring transcript"}`)
  assert.equal(event?.type, "phase")
  assert.equal(event?.phase, "recovering")
  assert.equal(event?.data, "restoring transcript")
})

test("parseStreamLine recovers two concatenated JSON objects on one line", () => {
  const events = parseStreamLine(`{"type":"text","data":"a"}{"type":"end","session_id":"x"}`)
  assert.equal(events.length, 2)
  assert.equal(events[0]?.type, "text")
  assert.equal(events[1]?.type, "end")
  assert.equal(events[1]?.sessionId, "x")
})

test("parseStreamLine treats non-JSON provider chatter as visible text", () => {
  const [event] = parseStreamLine("still working…")
  assert.equal(event?.type, "text")
  assert.equal(event?.data, "still working…\n")
})

test("StreamingJsonParser buffers a JSON object split across chunks", () => {
  const parser = new StreamingJsonParser()
  assert.deepEqual(parser.push(`{"type":"text","da`), [])
  assert.equal(looksLikeIncompleteJson(parser.pending()), true)
  const events = parser.push(`ta":"world"}\n`)
  assert.equal(events.length, 1)
  assert.equal(events[0]?.data, "world")
})

test("StreamingJsonParser.flush emits a leftover complete line and ignores blank leftovers", () => {
  const parser = new StreamingJsonParser()
  parser.push(`{"type":"end","sessionId":"done"}`)
  const flushed = parser.flush()
  assert.equal(flushed[0]?.type, "end")
  assert.equal(flushed[0]?.sessionId, "done")
  assert.deepEqual(parser.flush(), [])
})

test("extractJsonObjects ignores braces inside quoted strings", () => {
  const values = extractJsonObjects(`{"type":"text","data":"use {curly} braces"} leftover`)
  assert.equal(values.length, 1)
  assert.equal((values[0] as { data: string }).data, "use {curly} braces")
})
