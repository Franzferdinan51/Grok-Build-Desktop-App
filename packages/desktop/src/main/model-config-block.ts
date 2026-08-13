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

export type ExtraManagedModel = {
  alias: string
  model: string
  baseUrl: string
  name: string
  envKey: string
  apiBackend?: "chat_completions" | "responses" | "messages"
  contextWindow?: number
}

export const DESKTOP_NIM_ALIAS = "gb-desktop-nim"

const MANAGED_START = "# BEGIN GROK BUILD DESKTOP MANAGED PROVIDERS"
const MANAGED_END = "# END GROK BUILD DESKTOP MANAGED PROVIDERS"

function renderModelBlock(input: ExtraManagedModel): string {
  const context = input.contextWindow ? `\ncontext_window = ${Math.floor(input.contextWindow)}` : ""
  return `[model.${input.alias}]\nmodel = ${JSON.stringify(input.model)}\nbase_url = ${JSON.stringify(input.baseUrl)}\nname = ${JSON.stringify(input.name)}\napi_backend = ${JSON.stringify(input.apiBackend || "chat_completions")}\nenv_key = ${JSON.stringify(input.envKey)}${context}`
}

/**
 * Build the next managed block for `~/.grok/config.toml` from the supplied
 * provider settings + the live codex OAuth bridge snapshot.
 * Grok Build reads `model`, not `model_name`, as the upstream API id.
 */
export function buildManagedModelsBlock(
  providers: ProviderBlock[],
  settings: ManagedModels,
  codexSnapshot: { baseUrl: string; models: CodexOAuthModel[] } | null,
  extras: ExtraManagedModel[] = [],
): string {
  const blocks = providers.flatMap((preset) => {
    const setting = settings[preset.id]
    if (!setting?.modelId) return []
    const alias = `${preset.id}-${setting.modelId}`.toLowerCase().replace(/[^a-z0-9_-]/g, "-").replace(/-+/g, "-")
    return [renderModelBlock({
      alias,
      model: setting.modelId,
      baseUrl: setting.baseUrl,
      name: `${preset.label} · ${setting.modelId}`,
      envKey: preset.envKey,
    })]
  })
  const codexBlocks = (codexSnapshot?.models || []).map((model) => renderModelBlock({
    alias: `codex-${model.id.toLowerCase().replace(/[^a-z0-9_-]/g, "-")}`,
    model: model.id,
    baseUrl: codexSnapshot!.baseUrl,
    name: `OpenAI Codex · ${model.id}`,
    envKey: "GROK_CODEX_OAUTH_BRIDGE_KEY",
    apiBackend: "responses",
    contextWindow: model.contextWindow,
  }))
  const extraBlocks = extras
    .filter((entry) => /^[a-z0-9][a-z0-9_-]*$/.test(entry.alias) && entry.model.trim() && /^https?:\/\//i.test(entry.baseUrl))
    .map(renderModelBlock)
  return `${MANAGED_START}\n${[...blocks, ...codexBlocks, ...extraBlocks].join("\n\n")}\n${MANAGED_END}`
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
