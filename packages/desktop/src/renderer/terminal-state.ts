export const MAX_TERMINAL_OUTPUT_CHARS = 200_000
export const MAX_TERMINAL_HISTORY = 50

export type TerminalSnapshot = { output: string; history: string[] }

let cachedHistory: string[] = []

export function cacheTerminalHistory(history: string[]): void {
  cachedHistory = history.slice(0, MAX_TERMINAL_HISTORY)
}

export function cachedTerminalHistory(): string[] {
  return cachedHistory
}

export function terminalStateKey(workspace: string): string {
  return `terminal.state.${encodeURIComponent(workspace)}`
}

export function parseTerminalSnapshot(value: unknown): TerminalSnapshot {
  if (!value || typeof value !== "object") return { output: "", history: [] }
  const record = value as { output?: unknown; history?: unknown }
  const output = typeof record.output === "string" ? record.output.slice(-MAX_TERMINAL_OUTPUT_CHARS) : ""
  const history = Array.isArray(record.history)
    ? record.history.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0).map((entry) => entry.trim()).slice(0, MAX_TERMINAL_HISTORY)
    : []
  return { output, history }
}

export function addTerminalHistory(history: string[], command: string): string[] {
  const trimmed = command.trim()
  return trimmed ? [trimmed, ...history.filter((entry) => entry !== trimmed)].slice(0, MAX_TERMINAL_HISTORY) : history
}

export function browseTerminalHistory(history: string[], index: number, direction: -1 | 1): { index: number; command: string } {
  if (!history.length) return { index: -1, command: "" }
  const next = direction < 0 ? Math.min(history.length - 1, index + 1) : index <= 0 ? -1 : index - 1
  return { index: next, command: next < 0 ? "" : history[next] || "" }
}
