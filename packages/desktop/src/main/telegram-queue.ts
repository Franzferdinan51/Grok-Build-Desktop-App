export type TelegramQueueEntry = { chatId: string; text: string; queuedAt: number }

export function enqueueTelegramTask(queue: TelegramQueueEntry[], entry: TelegramQueueEntry): number {
  queue.push({ ...entry, text: entry.text.slice(0, 20_000) })
  return queue.length
}

export function prioritizeTelegramTask(queue: TelegramQueueEntry[], entry: TelegramQueueEntry): number {
  queue.unshift({ ...entry, text: entry.text.slice(0, 20_000) })
  return queue.length
}

export function dequeueChatTasks(queue: TelegramQueueEntry[], chatId: string): number {
  let removed = 0
  for (let index = queue.length - 1; index >= 0; index -= 1) {
    if (queue[index]?.chatId === chatId) {
      queue.splice(index, 1)
      removed += 1
    }
  }
  return removed
}

export function describeCancelChat(input: {
  chatId: string
  runningChat: string
  reserved: boolean
  backendRunning: boolean
  dequeued: number
}): { cancelBackend: boolean; ownsActive: boolean; message: string } {
  const ownsActive = input.runningChat === input.chatId
  const orphanActive = !input.runningChat && (input.backendRunning || input.reserved)
  if (ownsActive || orphanActive) {
    return {
      cancelBackend: true,
      ownsActive,
      message: ownsActive
        ? "Stopping this chat’s active Grok Build task…"
        : "Stopping the active Grok Build task…",
    }
  }
  if (input.dequeued) {
    return {
      cancelBackend: false,
      ownsActive: false,
      message: `Removed ${input.dequeued} queued task${input.dequeued === 1 ? "" : "s"} for this chat.`,
    }
  }
  return { cancelBackend: false, ownsActive: false, message: "This chat has no active or queued task." }
}
