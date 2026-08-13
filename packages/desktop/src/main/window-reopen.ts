/**
 * Decide how a second launch / dock click should reopen the workbench.
 * Quick Entry is a hidden skipTaskbar window, so counting "any window"
 * would swallow reopen after the user closed the main workbench.
 */

export type ReopenTarget = { kind: "workbench" } | { kind: "utility" }

export function classifyWindow(input: { destroyed?: boolean; title?: string; skipTaskbar?: boolean }): ReopenTarget | null {
  if (input.destroyed) return null
  if (input.skipTaskbar || input.title === "Grok Build Quick Entry") return { kind: "utility" }
  return { kind: "workbench" }
}

export function shouldRecreateWorkbench(windows: Array<{ destroyed?: boolean; title?: string; skipTaskbar?: boolean }>): boolean {
  return !windows.some((window) => classifyWindow(window)?.kind === "workbench")
}
