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
}

export function providerFamily(modelId: string): string {
  const value = modelId.trim().toLowerCase()
  if (!value) return "unknown"
  if (value.startsWith("codex-") || value.includes("gpt-")) return "openai"
  if (value.includes("minimax") || value.startsWith("m2.") || value.startsWith("m3")) return "minimax"
  if (value.includes("nemotron") || value.startsWith("nvidia/")) return "nvidia"
  if (value.includes("lmstudio") || value.includes("localhost")) return "lmstudio"
  if (value.startsWith("grok") || value.includes("grok-")) return "xai"
  return "compatible"
}

export function catalogModelOptions(models: string[], secrets: ProviderSecretLike[] = [], defaultModel?: string): ModelOption[] {
  const configuredFamilies = new Set(secrets.filter((secret) => secret.configured).map((secret) => providerFamily(secret.modelId || secret.id)))
  const configuredIds = new Set(secrets.filter((secret) => secret.configured && secret.modelId).map((secret) => secret.modelId))
  return [...new Set(models.filter(Boolean))].map((id) => {
    const family = providerFamily(id)
    const needsSecret = family === "openai" || family === "minimax" || family === "nvidia" || family === "compatible"
    const available = !needsSecret || configuredIds.has(id) || configuredFamilies.has(family) || family === "xai" || id === defaultModel
    return {
      id,
      label: id === defaultModel ? `${id} (default)` : id,
      available,
      reason: available ? undefined : `Configure ${family} in Settings before selecting this Grok Build model`,
    }
  })
}
