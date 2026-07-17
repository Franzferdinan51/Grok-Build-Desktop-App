import { safeStorage } from "electron"
import { getStore } from "./store"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { homedir } from "os"
import { dirname, join } from "path"
import { removeLegacyCodexBridgeTables } from "./model-config-utils"

export const PROVIDER_PRESETS = [
  { id: "lm-studio", label: "LM Studio", envKey: "LM_STUDIO_API_KEY", baseUrl: "http://localhost:1234/v1" },
  { id: "ods", label: "ODS", envKey: "ODS_API_KEY", baseUrl: "http://localhost:8080/v1" },
  { id: "minimax", label: "MiniMax", envKey: "MINIMAX_API_KEY", baseUrl: "https://api.minimax.io/v1" },
  { id: "nvidia-build", label: "NVIDIA Build / NIM", envKey: "NVIDIA_API_KEY", baseUrl: "https://integrate.api.nvidia.com/v1" },
  { id: "openrouter", label: "OpenRouter", envKey: "OPENROUTER_API_KEY", baseUrl: "https://openrouter.ai/api/v1" },
  { id: "openai-compatible", label: "OpenAI-compatible provider", envKey: "OPENAI_COMPATIBLE_API_KEY", baseUrl: "https://api.example.com/v1" },
] as const
type ProviderDefinition = { id: string; label: string; envKey: string; baseUrl: string }
const providers = (): ProviderDefinition[] => [...PROVIDER_PRESETS, ...getStore().get("grok.customProviders", [])]

type SecretRecord = { label: string; envKey: string; encrypted: string }
const records = (): Record<string, SecretRecord> => getStore().get("grok.providerSecrets", {})
type CodexOAuthModel = { id: string; contextWindow?: number }
let codexOAuth: { baseUrl: string; models: CodexOAuthModel[] } | null = null

export function listProviderSecrets() {
  const saved = records()
  const settings = getStore().get("grok.providerSettings", {})
  return providers().map((preset) => ({ ...preset, ...settings[preset.id], modelId: settings[preset.id]?.modelId ?? "", configured: Boolean(saved[preset.id]) }))
}

export function addCustomProvider(label: string, baseUrl: string, modelId: string): void {
  const cleanLabel = label.trim(), cleanModel = modelId.trim()
  if (!cleanLabel || !cleanModel) throw new Error("Provider name and model ID are required")
  if (!/^[A-Za-z0-9_-]+$/.test(cleanModel)) throw new Error("Invalid model ID")
  const id = `custom-${cleanModel.toLowerCase()}`
  if (providers().some((provider) => provider.id === id)) throw new Error("That provider already exists")
  const envKey = `GROK_PROVIDER_${cleanModel.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_API_KEY`
  getStore().set("grok.customProviders", [...getStore().get("grok.customProviders", []), { id, label: cleanLabel, envKey, baseUrl }])
  saveProviderSettings(id, baseUrl, cleanModel)
}

export function removeCustomProvider(id: string): void {
  if (!id.startsWith("custom-")) throw new Error("Built-in providers cannot be removed")
  getStore().set("grok.customProviders", getStore().get("grok.customProviders", []).filter((entry) => entry.id !== id))
  removeProviderSecret(id)
  const settings = getStore().get("grok.providerSettings", {}); delete settings[id]; getStore().set("grok.providerSettings", settings); writeManagedModels(settings)
}

export function saveProviderSettings(id: string, baseUrl: string, modelId: string): void {
  const preset = providers().find((entry) => entry.id === id)
  if (!preset) throw new Error("Unknown provider")
  const url = new URL(baseUrl.trim())
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error("Provider URL must use HTTP or HTTPS")
  const cleanModel = modelId.trim()
  if (cleanModel && !/^[A-Za-z0-9_./:-]+$/.test(cleanModel)) throw new Error("Model ID contains unsupported characters")
  const settings = getStore().get("grok.providerSettings", {})
  settings[id] = { baseUrl: url.toString().replace(/\/$/, ""), modelId: cleanModel }
  getStore().set("grok.providerSettings", settings)
  writeManagedModels(settings)
}

function writeManagedModels(settings: Record<string, { baseUrl: string; modelId: string }>): void {
  const path = join(homedir(), ".grok", "config.toml")
  const start = "# BEGIN GROK BUILD DESKTOP MANAGED PROVIDERS"
  const end = "# END GROK BUILD DESKTOP MANAGED PROVIDERS"
  const existing = removeLegacyCodexBridgeTables(existsSync(path) ? readFileSync(path, "utf8") : "")
  const blocks = providers().flatMap((preset) => {
    const setting = settings[preset.id]
    if (!setting?.modelId) return []
    const alias = `${preset.id}-${setting.modelId}`.toLowerCase().replace(/[^a-z0-9_-]/g, "-").replace(/-+/g, "-")
    return [`[model.${alias}]\nbase_url = ${JSON.stringify(setting.baseUrl)}\nmodel_name = ${JSON.stringify(setting.modelId)}\nname = ${JSON.stringify(`${preset.label} · ${setting.modelId}`)}\napi_backend = "chat_completions"\nenv_key = ${JSON.stringify(preset.envKey)}`]
  })
  const codexBlocks = (codexOAuth?.models || []).map((model) => {
    const alias = `codex-${model.id.toLowerCase().replace(/[^a-z0-9_-]/g, "-")}`
    const context = model.contextWindow ? `\ncontext_window = ${Math.floor(model.contextWindow)}` : ""
    return `[model.${alias}]\nmodel = ${JSON.stringify(model.id)}\nbase_url = ${JSON.stringify(codexOAuth!.baseUrl)}\nname = ${JSON.stringify(`OpenAI Codex · ${model.id}`)}\napi_backend = "responses"\nenv_key = "GROK_CODEX_OAUTH_BRIDGE_KEY"${context}`
  })
  const managed = `${start}\n${[...blocks, ...codexBlocks].join("\n\n")}\n${end}`
  const pattern = new RegExp(`${start}[\\s\\S]*?${end}`, "m")
  const next = pattern.test(existing) ? existing.replace(pattern, managed) : `${existing.trimEnd()}\n\n${managed}\n`
  mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, next, { mode: 0o600 })
}

export function configureCodexOAuthModels(baseUrl: string, models: CodexOAuthModel[]): void {
  codexOAuth = { baseUrl, models }
  writeManagedModels(getStore().get("grok.providerSettings", {}))
}

export function saveProviderSecret(id: string, value: string): void {
  const preset = providers().find((entry) => entry.id === id)
  if (!preset) throw new Error("Unknown provider")
  if (!value.trim()) throw new Error("API key is required")
  if (!safeStorage.isEncryptionAvailable()) throw new Error("OS credential encryption is unavailable")
  const saved = records()
  saved[id] = { label: preset.label, envKey: preset.envKey, encrypted: safeStorage.encryptString(value.trim()).toString("base64") }
  getStore().set("grok.providerSecrets", saved)
}

export function removeProviderSecret(id: string): void {
  const saved = records(); delete saved[id]; getStore().set("grok.providerSecrets", saved)
}

export function providerSecretEnvironment(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const record of Object.values(records())) {
    try { env[record.envKey] = safeStorage.decryptString(Buffer.from(record.encrypted, "base64")) } catch { /* never expose broken secrets */ }
  }
  return { ...env, ...extra }
}

export async function testProvider(id: string): Promise<{ ok: boolean; models?: number; message: string }> {
  const provider = listProviderSecrets().find((entry) => entry.id === id)
  if (!provider) throw new Error("Unknown provider")
  const record = records()[id]
  let key = ""
  if (record) { try { key = safeStorage.decryptString(Buffer.from(record.encrypted, "base64")) } catch {} }
  const response = await fetch(`${provider.baseUrl.replace(/\/$/, "")}/models`, { headers: key ? { Authorization: `Bearer ${key}` } : {}, signal: AbortSignal.timeout(8000) })
  if (!response.ok) return { ok: false, message: `HTTP ${response.status} ${response.statusText}` }
  const body = await response.json().catch(() => ({})) as { data?: unknown[] }
  return { ok: true, models: body.data?.length, message: body.data ? `${body.data.length} models available` : "Endpoint reachable" }
}
