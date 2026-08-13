import type { StoredChatSummary, StoredChatThread } from "./conversation-store-types.ts"

export function conversationSummary(thread: StoredChatThread): StoredChatSummary {
  const { messages, ...metadata } = thread
  return { ...metadata, messageCount: messages.length }
}
