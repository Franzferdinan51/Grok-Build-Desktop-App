/**
 * OpenMaus-style provider availability: the model picker can dim or explain
 * why a catalog entry is unusable without adding a second agent runtime.
 * Every listed model remains a Grok Build `--model` target.
 */

export type ProviderSecretLike = { id: string; label: string; modelId: string; configured: boolean; baseUrl?: string }

export type ModelOption = {
  id: string
  label: string
  available: boolean
  reason?: string
  family?: string
}

export type ModelOptionGroup = {
  family: string
  label: string
  options: ModelOption[]
}

export const PROVIDER_FAMILY_LABELS: Record<string, string> = {
  xai: "xAI / Grok",
  openai: "OpenAI Codex",
  minimax: "MiniMax",
  nvidia: "NVIDIA",
  lmstudio: "LM Studio",
  compatible: "Compatible",
  unknown: "Other",
}

const FAMILY_ORDER = ["xai", "openai", "minimax", "nvidia", "lmstudio", "compatible", "unknown"]

export function providerFamily(modelId: string): string {
  const value = modelId.trim().toLowerCase()
  if (!value) return "unknown"
  if (value.startsWith("codex-") || /(^|[^a-z])gpt-/.test(value)) return "openai"
  // NVIDIA-hosted MiniMax / DeepSeek / GLM aliases end in `-nvidia` and must
  // not be treated as MiniMax OAuth or generic compatible models.
  if (value.includes("nemotron") || value.startsWith("nvidia/") || value.startsWith("nvidia-") || value.endsWith("-nvidia")) return "nvidia"
  if (value.includes("minimax") || value.startsWith("m2.") || value.startsWith("m3")) return "minimax"
  if (value.includes("lmstudio") || value.includes("localhost")) return "lmstudio"
  if (value.startsWith("grok") || value.includes("grok-")) return "xai"
  return "compatible"
}

export function secretFamily(secret: ProviderSecretLike): string {
  return providerFamily(secret.modelId || secret.id)
}

export function catalogModelOptions(models: string[], secrets: ProviderSecretLike[] = [], defaultModel?: string, signedFamilies: string[] = [], catalogIds: string[] = []): ModelOption[] {
  const configuredFamilies = new Set([
    ...secrets.filter((secret) => secret.configured).map(secretFamily),
    ...signedFamilies.filter(Boolean),
  ])
  const configuredIds = new Set(secrets.filter((secret) => secret.configured && secret.modelId).map((secret) => secret.modelId))
  const listed = new Set(catalogIds.filter(Boolean))
  return [...new Set(models.filter(Boolean))].map((id) => {
    const family = providerFamily(id)
    const needsSecret = family === "openai" || family === "minimax" || family === "nvidia" || family === "compatible"
    const listedByGrok = listed.has(id)
    const available = listedByGrok || !needsSecret || configuredIds.has(id) || configuredFamilies.has(family) || id === defaultModel
    return {
      id,
      label: id === defaultModel ? `${id} (default)` : id,
      available,
      family,
      reason: available ? undefined : `Configure ${providerFamilyLabel(family)} in Settings before selecting this Grok Build model`,
    }
  })
}

export function providerFamilyLabel(family: string): string {
  return PROVIDER_FAMILY_LABELS[family] || PROVIDER_FAMILY_LABELS.unknown
}

export function groupedModelOptions(options: ModelOption[]): ModelOptionGroup[] {
  const buckets = new Map<string, ModelOption[]>()
  for (const option of options) {
    const family = option.family || providerFamily(option.id)
    const list = buckets.get(family) || []
    list.push(option)
    buckets.set(family, list)
  }
  return FAMILY_ORDER
    .filter((family) => buckets.has(family))
    .map((family) => ({ family, label: providerFamilyLabel(family), options: buckets.get(family)! }))
}
