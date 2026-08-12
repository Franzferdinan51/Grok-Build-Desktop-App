/**
 * Conversation export / copy helpers. Thoughts stay private; visible text
 * and errors become Markdown the user can save or paste.
 */

export type ExportableThread = {
  title: string
  workspace: string
  updatedAt: number
  model?: string
  summary?: string
  messages: { role: "user" | "assistant"; logs: { kind: string; content: string }[]; createdAt?: number }[]
}

const ACTION_TAG = /<app_action>[\s\S]*?<\/app_action>/g

export function visibleMessageMarkdown(message: ExportableThread["messages"][number]): string {
  return message.logs
    .filter((log) => log.kind !== "thought")
    .map((log) => log.content.replace(ACTION_TAG, "").trim())
    .filter(Boolean)
    .join("\n\n")
}

export function conversationToMarkdown(thread: ExportableThread): string {
  const body = thread.messages
    .map((message) => {
      const content = visibleMessageMarkdown(message)
      return content ? `## ${message.role === "user" ? "User" : "Assistant"}\n\n${content}` : ""
    })
    .filter(Boolean)
    .join("\n\n")
  return `# ${thread.title}\n\n- Workspace: ${thread.workspace}\n- Updated: ${new Date(thread.updatedAt).toISOString()}\n- Model: ${thread.model || "Default"}\n\n${thread.summary ? `> ${thread.summary}\n\n` : ""}${body}\n`
}

export function lastVisibleAssistantText(thread: Pick<ExportableThread, "messages">): string {
  for (let index = thread.messages.length - 1; index >= 0; index -= 1) {
    const message = thread.messages[index]
    if (message?.role !== "assistant") continue
    const text = visibleMessageMarkdown(message)
    if (text) return text
  }
  return ""
}
