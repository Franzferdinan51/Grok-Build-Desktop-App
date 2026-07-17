/**
 * Grok Build occasionally prints a JSON-serialized "Internal error: { ... }"
 * dump on stderr (for example when a provider returns null token counts that
 * the CLI cannot serialize). Surfacing that entire dump as the run error
 * fills the chat pane with prompt-usage metadata the user cannot act on.
 * This helper extracts the human-readable `message` when present and falls
 * back to the trimmed stderr otherwise, so callers still receive a usable
 * string without losing information.
 */
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
