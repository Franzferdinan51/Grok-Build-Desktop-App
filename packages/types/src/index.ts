/**
 * types/index.ts — Shared TypeScript types across all packages
 */

// Re-export ElectronAPI from preload for use in other packages
export type { ElectronAPI, BackendStatus, TelegramStatus } from "../../desktop/src/preload/index"

export type Provider = "grok" | "lmstudio" | "openai" | "codex"

export type AppSettings = {
  activeProvider: Provider
  thinkingEnabled: boolean
  autoApproveTools: boolean
  theme: "dark" | "light"
}

export type Session = {
  id: string
  provider: Provider
  model?: string
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
}

export type ChatMessage = {
  id: string
  role: "user" | "assistant" | "system" | "tool"
  content: string
  toolCalls?: ToolCall[]
  toolCallId?: string
  name?: string
  timestamp: number
}

export type ToolCall = {
  id: string
  name: string
  arguments: Record<string, unknown>
}
