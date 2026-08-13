/**
 * Detect Grok Build streaming-json tool/phase events that may have mutated
 * the workspace so attached Files/Review panes can refresh without opening.
 */

const MUTATING_TOOL_RE =
  /terminal|shell|exec|bash|command|write|edit|patch|replace|apply|create|delete|remove|move|rename|mkdir|format/i

const PATH_ARG_KEYS = ["path", "file_path", "filename", "file", "target_file", "new_path", "dest", "destination"]

export function toolMayMutateFiles(payload: { name?: unknown; tool?: unknown; inline_diff?: unknown }): boolean {
  if (typeof payload.inline_diff === "string" && payload.inline_diff.trim()) return true
  return MUTATING_TOOL_RE.test(String(payload.name ?? payload.tool ?? ""))
}

export function toolChangedPath(payload: { args?: unknown; arguments?: unknown }): string | undefined {
  const args = payload.args ?? payload.arguments
  if (!args || typeof args !== "object") return undefined
  const record = args as Record<string, unknown>
  for (const key of PATH_ARG_KEYS) {
    const value = record[key]
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return undefined
}

export function streamingEventMayMutateWorkspace(event: Record<string, unknown>): boolean {
  const type = String(event.type ?? "").toLowerCase()
  if (type === "phase") {
    const phase = String(event.phase ?? "")
    return phase === "completed" || phase === "failed" || phase === "cancelled"
  }
  if (type === "text" || type === "thought" || type === "error" || type === "end") return false
  const payload = {
    name: event.name ?? event.tool_name ?? event.toolName,
    tool: event.tool,
    inline_diff: event.inline_diff ?? event.inlineDiff,
  }
  if (type.includes("tool")) return toolMayMutateFiles({ ...payload, inline_diff: payload.inline_diff ?? event.data })
  return toolMayMutateFiles(payload)
}

export function createWorkspaceRefreshScheduler(refresh: () => void, delay = 500) {
  let lastFired = 0
  let trailing: ReturnType<typeof setTimeout> | undefined
  const fire = () => {
    lastFired = Date.now()
    refresh()
  }
  return {
    notify() {
      const since = Date.now() - lastFired
      if (since >= delay) {
        if (trailing) clearTimeout(trailing)
        trailing = undefined
        fire()
        return
      }
      if (!trailing) trailing = setTimeout(() => {
        trailing = undefined
        fire()
      }, delay - since)
    },
    dispose() {
      if (trailing) clearTimeout(trailing)
      trailing = undefined
    },
  }
}
