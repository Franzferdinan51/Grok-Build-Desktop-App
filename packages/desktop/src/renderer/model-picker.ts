import { groupedModelOptions, providerFamilyLabel, type ModelOption, type ModelOptionGroup } from "./provider-availability.ts"

export function modelDisplayName(id: string): string {
  const value = id.trim()
  if (!value) return "Grok Build default"
  const nvidia = /(?:^|-)nvidia$/i.test(value) || /nemotron|^nvidia[/-]/i.test(value)
  const base = value.replace(/-nvidia$/i, "").replace(/[/_]+/g, "-")
  const titled = base.split("-").filter(Boolean).map((part) => {
    if (/^\d/.test(part) || part.length <= 2) return part.toUpperCase()
    return part.charAt(0).toUpperCase() + part.slice(1)
  }).join(" ")
  return nvidia ? `${titled} · NVIDIA` : titled
}

export function modelPickerLabel(id: string, emptyLabel: string): string {
  return id.trim() ? modelDisplayName(id) : emptyLabel
}

export function filterModelGroups(options: ModelOption[], query: string): ModelOptionGroup[] {
  const needle = query.trim().toLowerCase()
  const groups = groupedModelOptions(options)
  if (!needle) return groups
  return groups
    .map((group) => ({
      ...group,
      options: group.options.filter((option) => `${option.id} ${option.label} ${modelDisplayName(option.id)} ${providerFamilyLabel(option.family || "")}`.toLowerCase().includes(needle)),
    }))
    .filter((group) => group.options.length)
}

export function flattenModelOptions(groups: ModelOptionGroup[]): ModelOption[] {
  return groups.flatMap((group) => group.options)
}
