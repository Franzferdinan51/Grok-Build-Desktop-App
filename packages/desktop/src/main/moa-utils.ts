const MAX_MOA_CONTEXT_CHARS = 8_000

export function boundedMoaContext(value?: string): string {
  const context = value?.trim() || ""
  if (context.length <= MAX_MOA_CONTEXT_CHARS) return context
  return `[Earlier context omitted to keep reference prompts within OS limits.]\n${context.slice(-MAX_MOA_CONTEXT_CHARS)}`
}
