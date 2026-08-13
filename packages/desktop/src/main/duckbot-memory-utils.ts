export type DuckbotMemoryStats = { vector_chunks?: number; vector_by_tier?: Record<string, number>; graph_entities?: number; graph_relationships?: number; blocks?: number; quarantine_pending?: number; generated_at?: number }

export function normalizeMemoryStats(value: unknown): DuckbotMemoryStats {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {}
  const tiers = raw.vector_by_tier && typeof raw.vector_by_tier === "object" ? raw.vector_by_tier as Record<string, unknown> : {}
  return {
    vector_chunks: Number(raw.vector_chunks || 0),
    vector_by_tier: Object.fromEntries(Object.entries(tiers).map(([key, count]) => [key, Number(count || 0)])),
    graph_entities: Number(raw.graph_entities || 0),
    graph_relationships: Number(raw.graph_relationships || 0),
    blocks: Number(raw.blocks || 0),
    quarantine_pending: Number(raw.quarantine_pending || 0),
    generated_at: Number(raw.generated_at || 0),
  }
}
