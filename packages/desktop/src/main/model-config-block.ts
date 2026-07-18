/**
 * model-config-block.ts — Pure layout helpers for the managed section
 * of `~/.grok/config.toml`.
 *
 * Exposed separately from `model-secrets.ts` so the smoke harness can
 * exercise the block layout without booting Electron's `safeStorage` or
 * the persisted provider store. The block format is what Grok Build
 * reads back via `grok models`; drift here silently breaks the catalog.
 */

export type CodexOAuthModel = { id: string; contextWindow?: number }

export type ProviderBlock = { id: string; label: string; envKey: string; baseUrl: string }

export type ManagedModels = Record<string, { baseUrl: string; modelId: string }>

const MANAGED_START = "# BEGIN GROK BUILD DESKTOP MANAGED PROVIDERS"
const MANAGED_END = "# END GROK BUILD DESKTOP MANAGED PROVIDERS"

/**
 * Build the next managed block for `~/.grok/config.toml` from the supplied
 * provider settings + the live codex OAuth bridge snapshot.
 */
export function buildManagedModelsBlock(
  providers: ProviderBlock[],
  settings: ManagedModels,
  codexSnapshot: { baseUrl: string; models: CodexOAuthModel[] } | null,
): string {
  const blocks = providers.flatMap((preset) => {
    const setting = settings[preset.id]
    if (!setting?.modelId) return []
    const alias = `${preset.id}-${setting.modelId}`.toLowerCase().replace(/[^a-z0-9_-]/g, "-").replace(/-+/g, "-")
    return [`[model.${alias}]\nbase_url = ${JSON.stringify(setting.baseUrl)}\nmodel_name = ${JSON.stringify(setting.modelId)}\nname = ${JSON.stringify(`${preset.label} · ${setting.modelId}`)}\napi_backend = "chat_completions"\nenv_key = ${JSON.stringify(preset.envKey)}`]
  })
  const codexBlocks = (codexSnapshot?.models || []).map((model) => {
    const alias = `codex-${model.id.toLowerCase().replace(/[^a-z0-9_-]/g, "-")}`
    const context = model.contextWindow ? `\ncontext_window = ${Math.floor(model.contextWindow)}` : ""
    return `[model.${alias}]\nmodel = ${JSON.stringify(model.id)}\nbase_url = ${JSON.stringify(codexSnapshot!.baseUrl)}\nname = ${JSON.stringify(`OpenAI Codex · ${model.id}`)}\napi_backend = "responses"\nenv_key = "GROK_CODEX_OAUTH_BRIDGE_KEY"${context}`
  })
  return `${MANAGED_START}\n${[...blocks, ...codexBlocks].join("\n\n")}\n${MANAGED_END}`
}

/**
 * Splice the managed block into the existing `~/.grok/config.toml`. The
 * desktop always writes to its own begin/end markers, so hand-written
 * configuration outside the block is preserved.
 */
export function spliceManagedModels(existing: string, managedBlock: string): string {
  const pattern = new RegExp(`${MANAGED_START}[\\s\\S]*?${MANAGED_END}`, "m")
  return pattern.test(existing) ? existing.replace(pattern, managedBlock) : `${existing.trimEnd()}\n\n${managedBlock}\n`
}

export const MANAGED_MARKERS = { start: MANAGED_START, end: MANAGED_END } as const
