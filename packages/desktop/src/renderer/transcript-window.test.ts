import assert from "node:assert/strict"
import test from "node:test"
import { DEFAULT_TRANSCRIPT_PAGE_SIZE, expandTranscript, transcriptPage, visibleTranscriptStart } from "./transcript-window.ts"

test("transcript window keeps the newest messages visible", () => {
    assert.equal(visibleTranscriptStart(100, 40), 60)
    assert.deepEqual(transcriptPage(100, 40), { start: 60, hidden: 60 })
  })

test("transcript window does not report hidden messages for a short conversation", () => {
    assert.deepEqual(transcriptPage(12, 40), { start: 0, hidden: 0 })
    assert.equal(visibleTranscriptStart(0, 40), 0)
  })

test("transcript window expands in bounded pages", () => {
    assert.equal(expandTranscript(40), 40 + DEFAULT_TRANSCRIPT_PAGE_SIZE)
    assert.equal(expandTranscript(40, 10), 50)
    assert.equal(expandTranscript(40, 0), 41)
  })
