// Conversation context the reference advisors receive alongside the
// current instruction. Larger than the prior 8_000 chars so multi-turn
// conversations have room to land; the slice is anchored on the most
// recent content because that is what the aggregator will actually
// act on.
export const MAX_MOA_CONTEXT_CHARS = 16_000

export function boundedMoaContext(value?: string): string {
  const context = value?.trim() || ""
  if (context.length <= MAX_MOA_CONTEXT_CHARS) return context
  return `[Earlier context omitted to keep reference prompts within OS limits.]\n${context.slice(-MAX_MOA_CONTEXT_CHARS)}`
}

export function normalizeMoaReferenceBudget(value?: number): number {
  if (!Number.isFinite(value)) return 600
  return Math.min(2_000, Math.max(200, Math.floor(value!)))
}

/**
 * Hermes-style label for a reference advisor's contribution.
 * The desktop renders `◇ Reference N/M — <model>` as a labelled thinking
 * chunk in the chat so the user can see what each advisor contributed
 * before the aggregator's response arrives.
 */
export function moaReferenceLabel(index: number, count: number, model: string): string {
  return `◇ Reference ${index + 1}/${count} — ${model}`
}

/**
 * Remove provider-private reasoning before advice reaches the acting
 * aggregator. Strips every envelope that the desktop knows about today:
 *
 *   - <think>...</think> blocks (the prior implementation)
 *   - unterminated <think>... (the prior implementation)
 *   - orphan closing </think> tags (the prior implementation)
 *   - <|channel|>analysis...<|channel|>final blocks (Grok Build's
 *     reasoning channel markers — added in this rebuild so a reference
 *     model's hidden reasoning does not leak into the
 *     PRIVATE_ADVISORY_DATA block the aggregator consumes)
 *   - bare <|channel|>final headers that often trail the analysis
 *     block (same reason)
 *
 * Order matters: paired envelopes are stripped before their unterminated
 * counterparts so a partial closing tag does not eat the rest of the
 * advisor's actual text.
 */
export function cleanMoaAdvisorOutput(value: string): string {
  return value
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<think>[\s\S]*$/gi, "")
    .replace(/<\/think>/gi, "")
    .replace(/<\|channel\|>\s*analysis[\s\S]*?(?=<\|channel\|>\s*final|$)/gi, "")
    .replace(/<\|channel\|>\s*final/gi, "")
    .trim()
}
