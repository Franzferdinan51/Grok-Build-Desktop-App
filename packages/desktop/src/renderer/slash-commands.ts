export type SlashCommand = {
  name: string
  description: string
  usage?: string
  aliases?: string[]
}

export const DESKTOP_SLASH_COMMANDS: SlashCommand[] = [
  { name: "help", description: "Show desktop slash commands" },
  { name: "new", aliases: ["clear"], description: "Start a new local chat" },
  { name: "model", description: "Select a Grok Build model", usage: "/model <model-id>" },
  { name: "think", description: "Toggle reasoning", usage: "/think [on|off]" },
  { name: "approve", description: "Toggle automatic tool approval", usage: "/approve [on|off]" },
  { name: "moa", description: "Run parallel reference advisors with one acting aggregator", usage: "/moa [off|2-8]" },
  { name: "goal", description: "Set or manage a durable workspace goal", usage: "/goal <objective|status|pause|resume|done|clear>" },
  { name: "learn", description: "Distill sources or this chat into a reusable skill", usage: "/learn [URL, path, notes, or workflow]" },
  { name: "preview", description: "Open or close the live preview", usage: "/preview [on|off]" },
  { name: "workspace", description: "Open the workspace editor" },
  { name: "terminal", description: "Open the project terminal" },
  { name: "review", description: "Open Git review" },
  { name: "skills", description: "Browse Grok Build skills" },
  { name: "runs", description: "Open Grok run history" },
  { name: "scheduled", description: "Open scheduled tasks" },
  { name: "settings", description: "Open settings" },
  { name: "stop", description: "Stop the active Grok task" },
  { name: "restart", description: "Restart Grok Build Desktop" },
]

export function parseSlashCommand(input: string): { name: string; args: string } | null {
  const match = input.trim().match(/^\/([^\s]*)\s*(.*)$/s)
  return match ? { name: match[1]!.toLowerCase(), args: match[2]!.trim() } : null
}

export function matchingSlashCommands(input: string, commands = DESKTOP_SLASH_COMMANDS): SlashCommand[] {
  const parsed = parseSlashCommand(input)
  if (!parsed || parsed.args) return []
  return commands.filter((command) => command.name.includes(parsed.name) || command.aliases?.some((alias) => alias.includes(parsed.name)))
}
