import type { BackendEvent } from "../preload"
import type { TaskLog } from "./chat-utils"

export function activeRunLogs(events: BackendEvent[]): TaskLog[] {
  const logs: TaskLog[] = []
  for (const event of events) {
    if ((event.type === "text" || event.type === "thought") && event.data) logs.push({ kind: event.type, content: event.data })
    else if (event.type === "error" && event.message) logs.push({ kind: "error", content: event.message })
    else if (event.type === "cancelled" && event.data) logs.push({ kind: "text", content: event.data })
  }
  return logs
}
