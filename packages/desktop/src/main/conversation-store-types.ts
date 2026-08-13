export type StoredChatLog = { kind: "text" | "thought" | "error"; content: string }
export type StoredChatMessage = { id: string; role: "user" | "assistant"; logs: StoredChatLog[]; createdAt: number }
export type StoredChatThread = {
  id: string; workspace: string; title: string; createdAt: number; updatedAt: number
  messages: StoredChatMessage[]; sessionId: string; model?: string; summary?: string
  pinned?: boolean; archived?: boolean; sessionStatus?: "new" | "resumable" | "recovered" | "broken"
}
export type StoredChatSummary = Omit<StoredChatThread, "messages"> & { messageCount: number }
