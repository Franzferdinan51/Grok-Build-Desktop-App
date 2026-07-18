/**
 * Pure parsing and menu construction for the Telegram command handler.
 * The stateful dispatch (queue mutation, backend invocation, etc.) still
 * lives in main/index.ts because the dispatcher needs access to module-
 * scope state (the live queue, the running chat id, the cancellation
 * flag, etc.). These helpers are extracted so the parser, the help text,
 * and the picker-callback table can be exercised from the smoke harness
 * without bootstrapping the desktop runtime.
 */

export type ParsedCommand = { name: string; argument: string }

const COMMAND_RE = /^\/(\w+)(?:@\w+)?(?:\s+([\s\S]*))?$/

/** Parse a Telegram user message into a command name + trailing argument. */
export function parseTelegramCommand(text: string): ParsedCommand | null {
  const trimmed = text.trim()
  if (!trimmed.startsWith("/")) return null
  const match = trimmed.match(COMMAND_RE)
  if (!match) return null
  const name = match[1]?.toLowerCase()
  if (!name) return null
  return { name, argument: (match[2] || "").trim() }
}

/** Detect the picker-callback prefixes the inline keyboard sends back. */
export const TELEGRAM_CALLBACK_PREFIXES = [
  "pick_model:",
  "pick_project:",
  "pick_project_id:",
  "pick_project_scratch",
  "pick_project_agent",
  "pick_mode:",
  "menu:",
] as const

export type TelegramCallbackKind =
  | "pick_model"
  | "pick_project_index"
  | "pick_project_id"
  | "pick_project_scratch"
  | "pick_project_agent"
  | "pick_mode"
  | "menu"

export function parseTelegramCallback(text: string): { kind: TelegramCallbackKind; payload: string } | null {
  const trimmed = text.trim()
  for (const prefix of TELEGRAM_CALLBACK_PREFIXES) {
    if (trimmed === prefix) return { kind: prefixToKind(prefix), payload: "" }
    if (trimmed.startsWith(prefix)) return { kind: prefixToKind(prefix), payload: trimmed.slice(prefix.length) }
  }
  return null
}

function prefixToKind(prefix: typeof TELEGRAM_CALLBACK_PREFIXES[number]): TelegramCallbackKind {
  if (prefix === "pick_model:") return "pick_model"
  if (prefix === "pick_project:") return "pick_project_index"
  if (prefix === "pick_project_id:") return "pick_project_id"
  if (prefix === "pick_project_scratch") return "pick_project_scratch"
  if (prefix === "pick_project_agent") return "pick_project_agent"
  if (prefix === "pick_mode:") return "pick_mode"
  return "menu"
}

export const TELEGRAM_HELP_TEXT = "**Grok Build Desktop Agent**\n\n/run <task> — run an agent task\n/new — start a fresh session\n/status — detailed agent status\n/models — choose a model\n/project — choose Project, Scratch, or Agent mode\n/mode [fast|balanced|deep] — response-speed profile\n/queue — show queued work\n/steer <task> — prioritize the next instruction\n/interrupt <task> — stop and redirect active work\n/retry — retry the previous instruction\n/undo — rewind the previous turn\n/compress — checkpoint and compact context\n/reasoning [on|off] — session reasoning control\n/history — recent visible conversation\n/schedules — scheduled agent work\n/cancel — stop the current task\n/restart — restart the desktop agent\n\nPlain messages continue the current agent session."

export type TelegramReply = { text: string; buttons: { text: string; data: string }[][] }

/** Build the main menu reply (mirrors the inline keyboard sent on /help, /start, /menu). */
export function buildTelegramMenuReply(): TelegramReply {
  return {
    text: TELEGRAM_HELP_TEXT,
    buttons: [
      [{ text: "🤖 Models", data: "menu:models" }, { text: "📁 Projects", data: "menu:projects" }],
      [{ text: "⚡ Fast", data: "pick_mode:fast" }, { text: "⚖️ Balanced", data: "pick_mode:balanced" }, { text: "🧠 Deep", data: "pick_mode:deep" }],
      [{ text: "📊 Status", data: "menu:status" }, { text: "📥 Queue", data: "menu:queue" }],
      [{ text: "✨ New session", data: "menu:new" }, { text: "⏹ Cancel", data: "menu:cancel" }],
    ],
  }
}

/**
 * Build the model picker reply. Caps at 30 buttons to match the prior
 * inline implementation and clips each label to Telegram's 60-char limit
 * (Telegram itself caps labels at 64 chars but the prior code used 60).
 */
export function buildTelegramModelPicker(models: string[], current: string, limit = 30): TelegramReply {
  return {
    text: `Choose a model\nCurrent: ${current}`,
    buttons: models.slice(0, limit).map((entry, index) => [{ text: `${entry === current ? "✓ " : ""}${entry}`.slice(0, 60), data: `pick_model:${index}` }]),
  }
}

/** Map the legacy `menu:*` callbacks to the slash command they represent. */
export function mapMenuCallback(command: string): string | null {
  switch (command) {
    case "models": return "/models"
    case "projects": return "/projects"
    case "status": return "/status"
    case "cancel": return "/cancel"
    case "new": return "/new"
    case "queue": return "/queue"
    default: return null
  }
}
