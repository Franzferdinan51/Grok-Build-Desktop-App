/**
 * Grok Build occasionally prints a JSON-serialized "Internal error: { ... }"
 * dump on stderr (for example when a provider returns null token counts that
 * the CLI cannot serialize). Surfacing that entire dump as the run error
 * fills the chat pane with prompt-usage metadata the user cannot act on.
 * This helper extracts the human-readable `message` when present and falls
 * back to the trimmed stderr otherwise, so callers still receive a usable
 * string without losing information.
 */
export type BackendErrorClass = "timeout" | "authentication" | "rate_limit" | "network" | "cancelled" | "serialization" | "runtime"

export function classifyBackendError(message: string): { class: BackendErrorClass; retryable: boolean; userMessage: string } {
  const text = message.trim()
  if (/cancel/i.test(text)) return { class: "cancelled", retryable: false, userMessage: text }
  if (/unauthorized|forbidden|auth/i.test(text)) return { class: "authentication", retryable: false, userMessage: "The selected model provider rejected authentication. Re-sign in or check the stored key, then retry." }
  if (/rate.?limit|429/i.test(text)) return { class: "rate_limit", retryable: true, userMessage: "The model provider rate-limited this turn. Wait a moment and retry the same instruction." }
  if (/no output|timed? ?out|timeout/i.test(text)) return { class: "timeout", retryable: true, userMessage: text }
  if (/network|connection|econn|enotfound|eai_again/i.test(text)) return { class: "network", retryable: true, userMessage: "The model provider connection dropped. Check the network and retry." }
  if (/serialization error:|error decoding response body|malformed streaming/i.test(text)) {
    return { class: "serialization", retryable: true, userMessage: "The model provider returned a malformed streaming event. Retry this turn; the desktop will not invent a second agent loop." }
  }
  return { class: "runtime", retryable: false, userMessage: text }
}

export function normalizeBackendStderr(stderr: string): string {
  const trimmed = stderr.trim()
  if (!trimmed) return ""
  // Common shape from Grok Build: "Internal error: { ... }" followed by a
  // newline and a JSON dump, or a bare JSON object spanning multiple lines.
  const jsonStart = trimmed.indexOf("{")
  if (jsonStart < 0) return trimmed
  const candidate = trimmed.slice(jsonStart)
  try {
    const parsed = JSON.parse(candidate) as { message?: unknown; error?: unknown }
    if (typeof parsed.message === "string" && parsed.message.trim()) {
      const prefix = trimmed.slice(0, jsonStart).trim()
      const prefixText = prefix && !/^internal error:?\s*$/i.test(prefix) ? `${prefix}: ` : ""
      return `${prefixText}${parsed.message.trim()}`
    }
    if (typeof parsed.error === "string" && parsed.error.trim()) {
      return parsed.error.trim()
    }
  } catch { /* not JSON — fall through to raw stderr */ }
  return trimmed
}
