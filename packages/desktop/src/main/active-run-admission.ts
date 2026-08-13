export type ActiveRunReservation = {
  runId: string
  threadId?: string
  cwd: string
  prompt: string
  startedAt: number
  events: unknown[]
}

export function reserveActiveRun(
  current: { runId?: string } | null,
  input: { cwd: string; prompt: string; threadId?: string },
  createId: () => string,
  now = Date.now(),
  maxPromptChars = 32_000,
): ActiveRunReservation {
  if (current) throw new Error("A Grok Build task is already running")
  return { runId: createId(), threadId: input.threadId, cwd: input.cwd, prompt: input.prompt.slice(0, maxPromptChars), startedAt: now, events: [] }
}
