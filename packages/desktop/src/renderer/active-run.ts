import type { BackendEvent } from "../preload"
import type { TaskLog } from "./chat-utils"

export function activeRunLogs(events: BackendEvent[]): TaskLog[] {
  const logs: TaskLog[] = []
  for (const event of events) {
    if ((event.type === "text" || event.type === "thought") && event.data) logs.push({ kind: event.type, content: event.data })
    else if (event.type === "error" && event.message) logs.push({ kind: "error", content: event.message })
    else if (event.type === "cancelled" && event.data) logs.push({ kind: "text", content: event.data })
    else if (event.type === "phase" && event.data) logs.push({ kind: "activity", content: event.data })
    else if (isToolEvent(event) ) logs.push({ kind: "activity", content: describeToolEvent(event) })
  }
  return logs
}

function isToolEvent(event: BackendEvent): boolean {
  return Boolean(/tool|function|command|file_change/i.test(event.type))
}

function describeToolEvent(event: BackendEvent): string {
  const payload = event as Record<string, unknown>
  const name = [payload.toolName, payload.tool_name, payload.name, payload.title, payload.command]
    .find((value): value is string => typeof value === "string" && Boolean(value.trim()))
  const detail = [payload.data, payload.message, payload.rawInput, payload.rawOutput]
    .find((value): value is string => typeof value === "string" && Boolean(value.trim()))
  return `🔧 ${name || event.type}${detail && detail !== name ? `\n${detail}` : ""}`
}
