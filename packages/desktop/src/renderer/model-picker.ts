import { groupedModelOptions, providerFamilyLabel, type ModelOption, type ModelOptionGroup } from "./provider-availability.ts"

/** Hermes-style composer menu: show a curated slice until the user searches. */
export const DEFAULT_VISIBLE_PER_PROVIDER = 8

const VARIANT_TAGS: ReadonlyArray<readonly [RegExp, string]> = [
  [/-fast$/i, "Fast"],
  [/-thinking$/i, "Thinking"],
  [/-preview$/i, "Preview"],
  [/-highspeed$/i, "Highspeed"],
  [/-nvidia$/i, "NVIDIA"],
]

export function modelBaseId(id: string): string {
  const trimmed = id.trim()
  const slash = trimmed.lastIndexOf("/")
  return slash >= 0 ? trimmed.slice(slash + 1) : trimmed
}

export function modelDisplayParts(id: string): { name: string; tag: string } {
  let base = modelBaseId(id)
  let tag = ""
  for (const [pattern, label] of VARIANT_TAGS) {
    if (pattern.test(base)) {
      tag = label
      base = base.replace(pattern, "")
      break
    }
  }
  base = base.replace(/-\d{8}$/, "")
  if (/^nemotron/i.test(base) && !tag) tag = "NVIDIA"
  if (/^codex-/i.test(base)) base = base.replace(/^codex-/i, "")
  if (/^gpt-/i.test(base)) {
    const rest = base.replace(/^gpt-/i, "").replace(/^(\d+)-(\d+)/, "$1.$2")
    const pretty = rest.split(/[-_]+/).filter(Boolean).map((part) => /^\d/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1)).join(" ")
    return { name: `GPT-${pretty}`, tag }
  }
  if (/^grok-/i.test(base) || /^grok$/i.test(base)) {
    return { name: base.replace(/^grok-?/i, "Grok ").replace(/-/g, " ").replace(/\s+/g, " ").trim(), tag }
  }
  if (/^glm-/i.test(base)) {
    return { name: base.replace(/^glm-/i, "GLM ").replace(/-/g, " ").replace(/\s+/g, " ").trim(), tag }
  }
  const titled = base.split(/[-_]+/).filter(Boolean).map((part) => {
    if (/^\d/.test(part) || part.length <= 2) return part.toUpperCase()
    if (/^minimax$/i.test(part)) return "MiniMax"
    return part.charAt(0).toUpperCase() + part.slice(1)
  }).join(" ")
  return { name: titled || id.trim() || "Grok Build default", tag }
}

export function modelDisplayName(id: string): string {
  const { name, tag } = modelDisplayParts(id)
  return tag ? `${name} · ${tag}` : name
}

export function modelPickerLabel(id: string, emptyLabel: string): string {
  return id.trim() ? modelDisplayName(id) : emptyLabel
}

export function collapseFastFamilies(options: ModelOption[], currentId = ""): ModelOption[] {
  const ids = new Set(options.map((option) => option.id))
  return options.filter((option) => {
    if (option.id === currentId) return true
    if (!/-fast$/i.test(option.id)) return true
    return !ids.has(option.id.replace(/-fast$/i, ""))
  })
}

export function filterModelGroups(options: ModelOption[], query: string, currentId = ""): ModelOptionGroup[] {
  const needle = query.trim().toLowerCase()
  const groups = groupedModelOptions(collapseFastFamilies(options, currentId))
  return groups
    .map((group) => {
      const matched = needle
        ? group.options.filter((option) => `${option.id} ${option.label} ${modelDisplayName(option.id)} ${providerFamilyLabel(option.family || "")}`.toLowerCase().includes(needle))
        : group.options
      if (needle || matched.length <= DEFAULT_VISIBLE_PER_PROVIDER) return { ...group, options: matched }
      const selected = matched.find((option) => option.id === currentId)
      const visible = matched.slice(0, DEFAULT_VISIBLE_PER_PROVIDER)
      if (selected && !visible.some((option) => option.id === selected.id)) {
        return { ...group, options: [selected, ...visible.slice(0, DEFAULT_VISIBLE_PER_PROVIDER - 1)] }
      }
      return { ...group, options: visible }
    })
    .filter((group) => group.options.length)
}

export function flattenModelOptions(groups: ModelOptionGroup[]): ModelOption[] {
  return groups.flatMap((group) => group.options)
}

export function hiddenModelCount(options: ModelOption[], query: string, currentId = ""): number {
  const needle = query.trim()
  if (needle) return 0
  const all = groupedModelOptions(collapseFastFamilies(options, currentId)).flatMap((group) => group.options)
  return Math.max(0, all.length - flattenModelOptions(filterModelGroups(options, query, currentId)).length)
}
