/**
 * Incremental NDJSON / streaming-json parser for Grok Build headless output.
 *
 * Grok Build emits one JSON object per line on stdout. Providers and CLI
 * wrappers sometimes wrap those lines as SSE (`data: …`), concatenate two
 * objects on one line, or split a single object across chunks. This parser
 * is the only place the desktop interprets that stream so the backend
 * adapter stays a thin `grok -p … --output-format streaming-json` client.
 */

export type StreamEvent = {
  type: string
  data?: string
  message?: string
  sessionId?: string
  [key: string]: unknown
}

const SSE_PREFIX = /^data:\s*/i

/** Extract complete top-level JSON objects from a string, ignoring braces inside quotes. */
export function extractJsonObjects(text: string): unknown[] {
  const values: unknown[] = []
  let start = -1
  let depth = 0
  let quoted = false
  let escaped = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (quoted) {
      if (escaped) escaped = false
      else if (char === "\\") escaped = true
      else if (char === '"') quoted = false
      continue
    }
    if (char === '"') { quoted = true; continue }
    if (char === "{") {
      if (depth === 0) start = index
      depth += 1
    } else if (char === "}" && depth > 0) {
      depth -= 1
      if (depth === 0 && start >= 0) {
        try { values.push(JSON.parse(text.slice(start, index + 1))) }
        catch { /* skip malformed fragment */ }
        start = -1
      }
    }
  }
  return values
}

export function normalizeStreamEvent(value: unknown, structuredOutput = false): StreamEvent {
  if (!value || typeof value !== "object") {
    return { type: "text", data: `${String(value ?? "")}\n` }
  }
  const record = value as Record<string, unknown>
  if (!record.sessionId && typeof record.session_id === "string") record.sessionId = record.session_id
  if (structuredOutput) {
    return { type: "text", data: `${JSON.stringify(record, null, 2)}\n` }
  }
  if (typeof record.type !== "string" || !record.type) {
    return { type: "text", data: `${JSON.stringify(record, null, 2)}\n` }
  }
  return record as StreamEvent
}

export function parseStreamLine(line: string, structuredOutput = false): StreamEvent[] {
  const trimmed = line.replace(/^\uFEFF/, "").trim()
  if (!trimmed) return []
  const payload = trimmed.replace(SSE_PREFIX, "").trim()
  if (!payload || payload === "[DONE]") return []
  try {
    return [normalizeStreamEvent(JSON.parse(payload), structuredOutput)]
  } catch {
    const objects = extractJsonObjects(payload)
    if (objects.length) return objects.map((value) => normalizeStreamEvent(value, structuredOutput))
    return [{ type: "text", data: `${payload}\n` }]
  }
}

export class StreamingJsonParser {
  private buffer = ""
  private readonly structuredOutput: boolean

  constructor(structuredOutput = false) {
    this.structuredOutput = structuredOutput
  }

  push(chunk: string): StreamEvent[] {
    this.buffer += chunk
    const lines = this.buffer.split(/\r?\n/)
    this.buffer = lines.pop() ?? ""
    const events: StreamEvent[] = []
    for (const line of lines) events.push(...parseStreamLine(line, this.structuredOutput))
    return events
  }

  /** Emit any leftover buffer as a final line. Incomplete JSON is held if it still looks open. */
  flush(): StreamEvent[] {
    const leftover = this.buffer
    this.buffer = ""
    if (!leftover.trim()) return []
    if (looksLikeIncompleteJson(leftover)) {
      const objects = extractJsonObjects(leftover)
      if (objects.length) return objects.map((value) => normalizeStreamEvent(value, this.structuredOutput))
    }
    return parseStreamLine(leftover, this.structuredOutput)
  }

  pending(): string {
    return this.buffer
  }
}

export function looksLikeIncompleteJson(text: string): boolean {
  const trimmed = text.replace(/^\uFEFF/, "").trim().replace(SSE_PREFIX, "").trim()
  if (!trimmed.startsWith("{")) return false
  let depth = 0
  let quoted = false
  let escaped = false
  for (const char of trimmed) {
    if (quoted) {
      if (escaped) escaped = false
      else if (char === "\\") escaped = true
      else if (char === '"') quoted = false
      continue
    }
    if (char === '"') quoted = true
    else if (char === "{") depth += 1
    else if (char === "}") depth -= 1
  }
  return quoted || depth > 0
}
