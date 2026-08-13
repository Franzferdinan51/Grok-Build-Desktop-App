import test from "node:test"
import assert from "node:assert/strict"
import { normalizeMemoryStats } from "./duckbot-memory-utils.ts"

test("normalizeMemoryStats keeps the health payload bounded and numeric", () => {
  assert.deepEqual(normalizeMemoryStats({
    vector_chunks: "12",
    vector_by_tier: { episodic: "8", semantic: 4 },
    graph_entities: "3",
    graph_relationships: 2,
    blocks: "1",
    quarantine_pending: undefined,
    generated_at: "42",
    secret: "not exposed",
  }), {
    vector_chunks: 12,
    vector_by_tier: { episodic: 8, semantic: 4 },
    graph_entities: 3,
    graph_relationships: 2,
    blocks: 1,
    quarantine_pending: 0,
    generated_at: 42,
  })
})

test("normalizeMemoryStats degrades malformed responses to zeroes", () => {
  assert.deepEqual(normalizeMemoryStats(null), {
    vector_chunks: 0,
    vector_by_tier: {},
    graph_entities: 0,
    graph_relationships: 0,
    blocks: 0,
    quarantine_pending: 0,
    generated_at: 0,
  })
})
