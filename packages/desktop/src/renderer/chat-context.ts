import type { TaskLog } from "./chat-utils"
export type ContextMessage = { role: "user" | "assistant"; logs: TaskLog[] }
export function visibleConversationContext(items: ContextMessage[], summary?: string, budget = 28_000): string {
  const blocks = items.map((message) => { const content = message.logs.filter((log) => log.kind === "text").map((log) => log.content.replace(/<app_action>[\s\S]*?<\/app_action>/g, "")).join("\n").trim(); return content ? `${message.role === "user" ? "User" : "Assistant"}: ${content}` : "" }).filter(Boolean)
  const selected: string[] = []; let used = summary?.length || 0
  for (let index = blocks.length - 1; index >= 0; index--) { if (used + blocks[index].length > budget) break; selected.unshift(blocks[index]); used += blocks[index].length }
  return [summary ? `Conversation checkpoint: ${summary}` : "", ...selected].filter(Boolean).join("\n\n")
}
export function checkpointFor(items: ContextMessage[]): string | undefined {
  if (items.length < 12) return undefined
  return items.slice(-20).map((message) => message.logs.filter((log) => log.kind === "text").map((log) => log.content).join(" ").replace(/\s+/g, " ").trim()).filter(Boolean).join(" ").slice(-4_000)
}
