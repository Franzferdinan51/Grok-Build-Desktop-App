import test from "node:test"
import assert from "node:assert/strict"
import { collectArtifacts, filterArtifacts } from "./artifact-utils.ts"

const thread = (content: string) => ({
  id: "thread-1", workspace: "/work/app", title: "Build the app", createdAt: 1, updatedAt: 2,
  sessionId: "", messages: [{ id: "message-1", role: "assistant" as const, createdAt: 3, logs: [{ kind: "text" as const, content }] }]
})

test("collects links, images, and file paths while ignoring thoughts", () => {
  const records = collectArtifacts([thread("See [the docs](https://example.com/docs) and ![logo](./assets/logo.png). /tmp/build.zip")])
  assert.deepEqual(records.map((record) => [record.kind, record.value]), [
    ["link", "https://example.com/docs"],
    ["image", "./assets/logo.png"],
    ["file", "/tmp/build.zip"]
  ])
})

test("deduplicates artifacts per conversation and supports filters", () => {
  const records = collectArtifacts([thread("https://example.com/docs https://example.com/docs")])
  assert.equal(records.length, 1)
  assert.equal(filterArtifacts(records, "docs", "link").length, 1)
  assert.equal(filterArtifacts(records, "docs", "file").length, 0)
})
