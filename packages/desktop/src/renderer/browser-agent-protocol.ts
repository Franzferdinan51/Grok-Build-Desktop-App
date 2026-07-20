export type BrowserAction =
  | { type: "navigate"; url: string }
  | { type: "click"; selector: string }
  | { type: "type"; selector: string; text: string }
  | { type: "hover"; selector: string }
  | { type: "select"; selector: string; value: string }
  | { type: "click_at"; x: number; y: number }
  | { type: "scroll"; pixels: number }
  | { type: "press"; selector?: string; key: string }
  | { type: "webmcp"; name: string; arguments: Record<string, unknown> }
  | { type: "screenshot" }
  | { type: "back" | "forward" | "reload" }
  | { type: "wait"; ms: number }

export type BrowserDirective = { kind: "action"; action: BrowserAction } | { kind: "done"; summary: string }

const embeddedJsonValues = (text: string): unknown[] => {
  const cleaned = text
    .replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, "")
    .replace(/<\/(?:think|thinking)>/gi, "")
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim()
  try { return [JSON.parse(cleaned)] }
  catch {
    // Retries may leave multiple top-level Grok CLI JSON envelopes in one
    // text stream (two provider errors followed by a successful fallback).
    // Split them without being confused by braces inside quoted strings.
    const values: unknown[] = []
    let start = -1
    let depth = 0
    let quoted = false
    let escaped = false
    for (let index = 0; index < cleaned.length; index += 1) {
      const char = cleaned[index]
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
          try { values.push(JSON.parse(cleaned.slice(start, index + 1))) }
          catch { /* ignore malformed provider fragments */ }
          start = -1
        }
      }
    }
    return values
  }
}

const isBrowserAction = (value: unknown): value is BrowserAction => {
  if (!value || typeof value !== "object") return false
  const action = value as Record<string, unknown>
  if (action.type === "navigate") return typeof action.url === "string"
  if (action.type === "click") return typeof action.selector === "string"
  if (action.type === "type") return typeof action.selector === "string" && typeof action.text === "string"
  if (action.type === "hover") return typeof action.selector === "string"
  if (action.type === "select") return typeof action.selector === "string" && typeof action.value === "string"
  if (action.type === "click_at") return typeof action.x === "number" && typeof action.y === "number"
  if (action.type === "scroll") return typeof action.pixels === "number"
  if (action.type === "press") return typeof action.key === "string" && (action.selector === undefined || typeof action.selector === "string")
  if (action.type === "webmcp") return typeof action.name === "string" && Boolean(action.arguments) && typeof action.arguments === "object"
  if (action.type === "wait") return typeof action.ms === "number"
  return action.type === "back" || action.type === "forward" || action.type === "reload" || action.type === "screenshot"
}

const directiveFromValue = (value: unknown): BrowserDirective | undefined => {
  if (!value || typeof value !== "object") return undefined
  const directive = value as Record<string, unknown>
  if (directive.kind === "done") return { kind: "done", summary: typeof directive.summary === "string" ? directive.summary : "Task complete." }
  if (directive.kind === "action" && isBrowserAction(directive.action)) return { kind: "action", action: directive.action }
  // Grok CLI's JSON output wraps constrained output in `structuredOutput`
  // (and mirrors it as a JSON string in `text`). Accept either envelope so
  // the renderer receives the directive rather than displaying CLI metadata.
  const structured = directiveFromValue(directive.structuredOutput)
  if (structured) return structured
  if (typeof directive.text === "string") {
    const nested = embeddedJsonValues(directive.text)
    for (let index = nested.length - 1; index >= 0; index -= 1) {
      const parsed = directiveFromValue(nested[index])
      if (parsed) return parsed
    }
  }
  return undefined
}

/** Parse both the current structured protocol and legacy tagged replies. */
export const parseBrowserDirective = (text: string): BrowserDirective | undefined => {
  const values = embeddedJsonValues(text)
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const direct = directiveFromValue(values[index])
    if (direct) return direct
  }

  const done = text.match(/<browser_done>([\s\S]*?)<\/browser_done>/i)
  if (done) {
    try {
      const value = JSON.parse(done[1]!) as { summary?: unknown }
      return { kind: "done", summary: typeof value.summary === "string" ? value.summary : "Task complete." }
    } catch { return { kind: "done", summary: done[1]!.trim() || "Task complete." } }
  }
  const action = text.match(/<browser_action>([\s\S]*?)<\/browser_action>/i)
  if (!action) return undefined
  try {
    const value: unknown = JSON.parse(action[1]!)
    return isBrowserAction(value) ? { kind: "action", action: value } : undefined
  } catch { return undefined }
}

export const BROWSER_AGENT_SYSTEM_PROMPT = `You are the action planner for Grok Build Desktop's embedded Browser Agent.
You are not a coding agent. Never inspect, read, create, edit, or discuss workspace files, prompt files, source code, terminals, builds, or patches. Never claim that changes were applied.
The renderer supplies the current visible page, DOM controls, screenshot path, WebMCP tools, prior browser actions, and the user's browser task. Select exactly one safe next browser action, or report completion only when the supplied post-action page state proves the task is complete.
Return only one JSON object matching the required schema. Do not return Markdown, private reasoning, prose outside the JSON object, or tool calls of your own. The desktop renderer—not you—executes the browser action.`

export const BROWSER_AGENT_DIRECTIVE_SCHEMA = JSON.stringify({
  type: "object",
  additionalProperties: false,
  properties: {
    kind: { type: "string", enum: ["action", "done"] },
    action: {
      type: "object",
      additionalProperties: true,
      properties: {
        type: { type: "string", enum: ["navigate", "click", "type", "hover", "select", "click_at", "scroll", "press", "webmcp", "screenshot", "back", "forward", "reload", "wait"] },
        url: { type: "string" }, selector: { type: "string" }, text: { type: "string" }, value: { type: "string" },
        key: { type: "string" }, name: { type: "string" }, arguments: { type: "object" },
        x: { type: "number" }, y: { type: "number" }, pixels: { type: "number" }, ms: { type: "number" },
      },
      required: ["type"],
    },
    summary: { type: "string" },
  },
  required: ["kind"],
})
