import type { StoredChatThread } from "../preload"

export function branchConversation(
  thread: StoredChatThread,
  messageId: string,
  id: string,
  now: number,
): { thread: StoredChatThread; prompt: string } | undefined {
  const index = thread.messages.findIndex((message) => message.id === messageId && message.role === "user")
  if (index < 0) return undefined
  const selected = thread.messages[index]
  const prompt = selected.logs.map((log) => log.content).join("\n").trim()
  if (!prompt) return undefined

  return {
    thread: {
      ...thread,
      id,
      title: `Branch · ${prompt.replace(/\s+/g, " ").slice(0, 60)}`,
      createdAt: now,
      updatedAt: now,
      messages: thread.messages.slice(0, index),
      sessionId: "",
      sessionStatus: "new",
      summary: undefined,
      pinned: false,
      archived: false,
    },
    prompt,
  }
}
