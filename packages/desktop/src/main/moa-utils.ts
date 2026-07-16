const MAX_MOA_CONTEXT_CHARS = 8_000

export function boundedMoaContext(value?: string): string {
  const context = value?.trim() || ""
  if (context.length <= MAX_MOA_CONTEXT_CHARS) return context
  return `[Earlier context omitted to keep reference prompts within OS limits.]\n${context.slice(-MAX_MOA_CONTEXT_CHARS)}`
}

export function normalizeMoaReferenceBudget(value?: number): number {
  if (!Number.isFinite(value)) return 600
  return Math.min(2_000, Math.max(200, Math.floor(value!)))
}
