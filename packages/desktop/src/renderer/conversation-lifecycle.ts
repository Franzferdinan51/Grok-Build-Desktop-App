/**
 * Desktop chat lifecycle helpers: retry the last user instruction and rewind
 * the last completed turn without touching Grok Build's process or session
 * ownership. The backend session is dropped by the caller when a rewind
 * would leave a poisoned native id.
 */

export type LifecycleMessage = { id: string; role: "user" | "assistant"; logs: { kind: string; content: string }[]; createdAt: number }

export function lastUserInstruction(messages: LifecycleMessage[]): string | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message?.role !== "user") continue
    const text = message.logs.filter((log) => log.kind === "text").map((log) => log.content).join("\n").trim()
    if (text) return text
  }
  return undefined
}

export function rewindLastTurn(messages: LifecycleMessage[]): { remaining: LifecycleMessage[]; removed: LifecycleMessage[] } {
  if (!messages.length) return { remaining: messages, removed: [] }
  const last = messages[messages.length - 1]!
  if (last.role === "assistant") {
    const prior = messages[messages.length - 2]
    if (prior?.role === "user") {
      return { remaining: messages.slice(0, -2), removed: messages.slice(-2) }
    }
    return { remaining: messages.slice(0, -1), removed: [last] }
  }
  return { remaining: messages.slice(0, -1), removed: [last] }
}
