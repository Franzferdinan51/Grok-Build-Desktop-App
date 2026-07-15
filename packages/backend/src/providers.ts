/**
 * backend/providers.ts — Provider abstraction layer
 *
 * First-class providers:
 *  1. xAI Grok   — via grok CLI headless (JSON-RPC over stdio)
 *  2. LM Studio — OpenAI-compatible HTTP API (default: http://100.116.54.125:1234)
 *  3. Codex     — OpenAI OAuth / API
 *  4. OpenAI    — GPT-4o via API key
 *
 * Each provider implements the same interface so the UI is provider-agnostic.
 *
 * Config snippets for each provider are documented here.
 * Full spec: /docs/PROVIDERS.md
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type ModelInfo = {
  id: string
  name: string
  contextLength: number
  supportsTools: boolean
  supportsVision: boolean
}

export type CompletionChunk = {
  delta: string
  done: boolean
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

export type ToolCall = {
  id: string
  name: string
  arguments: string // JSON string of arguments
}

export type CompletionOptions = {
  model?: string
  messages: ChatMessage[]
  temperature?: number
  maxTokens?: number
  stream?: boolean
  tools?: ToolDefinition[]
  thinking?: boolean
}

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool"
  content: string
  name?: string
  toolCallId?: string
}

export type ToolDefinition = {
  name: string
  description: string
  parameters: Record<string, unknown>
}

// ── Provider interface ────────────────────────────────────────────────────────

export interface AIProvider {
  readonly id: string
  readonly label: string

  /** Probe the provider for available models */
  listModels(): Promise<ModelInfo[]>

  /** Streaming text completion */
  complete(options: CompletionOptions): AsyncGenerator<CompletionChunk>

  /** Non-streaming completion (convenience) */
  completeSync(options: CompletionOptions): Promise<string>

  /** Check auth / connectivity */
  ping(): Promise<boolean>

  /** Returns true if tools/calls are supported */
  supportsToolCalls(): boolean
}

// ── Provider: LM Studio ───────────────────────────────────────────────────────

export class LMStudioProvider implements AIProvider {
  readonly id = "lmstudio"
  readonly label = "LM Studio"

  constructor(private baseUrl = "http://100.116.54.125:1234") {}

  async listModels(): Promise<ModelInfo[]> {
    try {
      const res = await fetch(`${this.baseUrl}/v1/models`)
      if (!res.ok) return []
      const data = await res.json() as { data: { id: string }[] }
      return data.data.map((m) => ({
        id: m.id,
        name: m.id,
        contextLength: 8192, // default, not exposed by LM Studio API
        supportsTools: false,
        supportsVision: false,
      }))
    } catch {
      return []
    }
  }

  async *complete(options: CompletionOptions): AsyncGenerator<CompletionChunk> {
    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: options.model ?? "local-model",
        messages: options.messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 4096,
        stream: true,
      }),
    })

    if (!response.ok) {
      throw new Error(`LM Studio error: ${response.status} ${response.statusText}`)
    }

    if (!response.body) throw new Error("LM Studio: no response body")

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() ?? ""

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue
        const data = line.slice(6)
        if (data === "[DONE]") {
          yield { delta: "", done: true }
          return
        }
        try {
          const parsed = JSON.parse(data) as {
            choices: { delta: { content?: string } }[]
          }
          const content = parsed.choices?.[0]?.delta?.content ?? ""
          if (content) yield { delta: content, done: false }
        } catch {
          // skip malformed lines
        }
      }
    }

    yield { delta: "", done: true }
  }

  async completeSync(options: CompletionOptions): Promise<string> {
    let text = ""
    for await (const chunk of this.complete(options)) {
      text += chunk.delta
    }
    return text
  }

  async ping(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/v1/models`, { signal: AbortSignal.timeout(3000) })
      return res.ok
    } catch {
      return false
    }
  }

  supportsToolCalls(): boolean {
    return false // LM Studio generally does not support tool calls in the same way
  }
}

// ── Provider: xAI Grok (via CLI headless) ─────────────────────────────────────

/**
 * GrokProvider wraps the `grok --headless --stdio` sidecar interface.
 * Communication is JSON-RPC 2.0 over stdin/stdout.
 *
 * Note: This class is used by the main process sidecar manager.
 * The renderer talks to it via IPC (grok:send / grok:onEvent).
 *
 * Config:
 *   - XAI_API_KEY env var or ~/.config/grok-build/credentials
 *   - Download: curl -fsSL https://x.ai/cli/install.sh | bash
 *   - Fork: https://github.com/Franzferdinan51/grok-build
 */
export class GrokProvider implements AIProvider {
  readonly id = "grok"
  readonly label = "Grok (xAI)"

  // The sidecar is accessed via IPC from the renderer
  // This class is mainly a type+config stub — the actual transport
  // lives in packages/desktop/src/main/sidecar.ts

  async listModels(): Promise<ModelInfo[]> {
    // Grok CLI headless mode doesn't expose a /models endpoint.
    // Known models are hardcoded here.
    return [
      {
        id: "grok-3",
        name: "Grok 3",
        contextLength: 131072,
        supportsTools: true,
        supportsVision: true,
      },
      {
        id: "grok-2",
        name: "Grok 2",
        contextLength: 131072,
        supportsTools: true,
        supportsVision: true,
      },
      {
        id: "grok-beta",
        name: "Grok Beta",
        contextLength: 131072,
        supportsTools: true,
        supportsVision: false,
      },
    ]
  }

  async *complete(_options: CompletionOptions): AsyncGenerator<CompletionChunk> {
    // Called by main process sidecar, not directly by renderer
    throw new Error("Use GrokSidecarManager.send() via IPC from the renderer")
  }

  async completeSync(_options: CompletionOptions): Promise<string> {
    throw new Error("Use GrokSidecarManager.send() via IPC")
  }

  async ping(): Promise<boolean> {
    try {
      const result = await window.api.grok.status()
      return result.running
    } catch {
      return false
    }
  }

  supportsToolCalls(): boolean {
    return true
  }
}

// ── Provider: OpenAI Codex ─────────────────────────────────────────────────────

export class CodexProvider implements AIProvider {
  readonly id = "codex"
  readonly label = "Codex (OpenAI)"

  constructor(private apiKey?: string, private baseUrl = "https://api.openai.com") {
    if (!apiKey) {
      this.apiKey = process.env.OPENAI_API_KEY
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    if (!this.apiKey) return []
    try {
      const res = await fetch(`${this.baseUrl}/v1/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      })
      if (!res.ok) return []
      const data = await res.json() as { data: { id: string; context_window?: number }[] }
      const codexModels = data.data.filter((m) => m.id.startsWith("gpt-4o") || m.id.startsWith("o1"))
      return codexModels.map((m) => ({
        id: m.id,
        name: m.id,
        contextLength: m.context_window ?? 128000,
        supportsTools: true,
        supportsVision: true,
      }))
    } catch {
      return []
    }
  }

  async *complete(options: CompletionOptions): AsyncGenerator<CompletionChunk> {
    if (!this.apiKey) throw new Error("Codex: no API key configured")

    const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: options.model ?? "gpt-4o",
        messages: options.messages,
        temperature: options.temperature ?? 0.2,
        max_completion_tokens: options.maxTokens ?? 4096,
        stream: true,
        tools: options.tools?.map((t) => ({
          type: "function",
          function: { name: t.name, description: t.description, parameters: t.parameters },
        })),
      }),
    })

    if (!res.ok) throw new Error(`Codex error: ${res.status} ${res.statusText}`)
    if (!res.body) throw new Error("Codex: no response body")

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() ?? ""

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue
        const data = line.slice(6)
        if (data === "[DONE]") { yield { delta: "", done: true }; return }
        try {
          const parsed = JSON.parse(data) as {
            choices: { delta: { content?: string } }[]
          }
          yield { delta: parsed.choices?.[0]?.delta?.content ?? "", done: false }
        } catch { /* skip */ }
      }
    }

    yield { delta: "", done: true }
  }

  async completeSync(options: CompletionOptions): Promise<string> {
    let text = ""
    for await (const chunk of this.complete(options)) {
      text += chunk.delta
    }
    return text
  }

  async ping(): Promise<boolean> {
    if (!this.apiKey) return false
    try {
      const res = await fetch(`${this.baseUrl}/v1/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(3000),
      })
      return res.ok
    } catch {
      return false
    }
  }

  supportsToolCalls(): boolean {
    return true
  }
}
