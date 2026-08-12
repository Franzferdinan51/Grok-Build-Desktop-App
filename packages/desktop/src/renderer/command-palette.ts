/**
 * Cmd/Ctrl-K command palette. Inspired by OpenMausBotRemix's searchable
 * bot/sidebar jump, but this only routes inside Grok Build Desktop — it
 * never starts a second agent runtime.
 */

export type PaletteItem = {
  id: string
  label: string
  hint: string
  kind: "command" | "view" | "chat" | "model"
}

export function buildPaletteItems(input: {
  commands: { name: string; description: string }[]
  views: { id: string; label: string }[]
  chats: { id: string; title: string }[]
  models: string[]
}): PaletteItem[] {
  return [
    ...input.commands.map((command) => ({
      id: `command:${command.name}`,
      label: `/${command.name}`,
      hint: command.description,
      kind: "command" as const,
    })),
    ...input.views.map((view) => ({
      id: `view:${view.id}`,
      label: view.label,
      hint: "Open view",
      kind: "view" as const,
    })),
    ...input.chats.filter((chat) => chat.title.trim()).map((chat) => ({
      id: `chat:${chat.id}`,
      label: chat.title,
      hint: "Open conversation",
      kind: "chat" as const,
    })),
    ...input.models.map((model) => ({
      id: `model:${model}`,
      label: model,
      hint: "Select Grok Build model",
      kind: "model" as const,
    })),
  ]
}

export function filterPaletteItems(items: PaletteItem[], query: string): PaletteItem[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return items.slice(0, 20)
  return items.filter((item) => `${item.label} ${item.hint}`.toLowerCase().includes(needle)).slice(0, 20)
}
