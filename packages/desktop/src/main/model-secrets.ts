import { safeStorage } from "electron"
import { getStore } from "./store"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { homedir } from "os"
import { dirname, join } from "path"

export const PROVIDER_PRESETS = [
  { id: "lm-studio", label: "LM Studio", envKey: "LM_STUDIO_API_KEY", baseUrl: "http://localhost:1234/v1" },
  { id: "ods", label: "ODS", envKey: "ODS_API_KEY", baseUrl: "http://localhost:8080/v1" },
  { id: "minimax", label: "MiniMax", envKey: "MINIMAX_API_KEY", baseUrl: "https://api.minimax.io/v1" },
  { id: "openai-compatible", label: "OpenAI-compatible provider", envKey: "OPENAI_COMPATIBLE_API_KEY", baseUrl: "https://api.example.com/v1" },
] as const

type SecretRecord = { label: string; envKey: string; encrypted: string }
const records = (): Record<string, SecretRecord> => getStore().get("grok.providerSecrets", {})

export function listProviderSecrets() {
  const saved = records()
  const settings = getStore().get("grok.providerSettings", {})
  return PROVIDER_PRESETS.map((preset) => ({ ...preset, ...settings[preset.id], modelId: settings[preset.id]?.modelId ?? "", configured: Boolean(saved[preset.id]) }))
}

export function saveProviderSettings(id: string, baseUrl: string, modelId: string): void {
  const preset = PROVIDER_PRESETS.find((entry) => entry.id === id)
  if (!preset) throw new Error("Unknown provider")
  const url = new URL(baseUrl.trim())
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error("Provider URL must use HTTP or HTTPS")
  const cleanModel = modelId.trim()
  if (cleanModel && !/^[A-Za-z0-9_-]+$/.test(cleanModel)) throw new Error("Model ID may contain letters, numbers, underscores, and hyphens")
  const settings = getStore().get("grok.providerSettings", {})
  settings[id] = { baseUrl: url.toString().replace(/\/$/, ""), modelId: cleanModel }
  getStore().set("grok.providerSettings", settings)
  writeManagedModels(settings)
}

function writeManagedModels(settings: Record<string, { baseUrl: string; modelId: string }>): void {
  const path = join(homedir(), ".grok", "config.toml")
  const start = "# BEGIN GROK BUILD DESKTOP MANAGED PROVIDERS"
  const end = "# END GROK BUILD DESKTOP MANAGED PROVIDERS"
  const existing = existsSync(path) ? readFileSync(path, "utf8") : ""
  const blocks = PROVIDER_PRESETS.flatMap((preset) => {
    const setting = settings[preset.id]
    if (!setting?.modelId) return []
    return [`[model.${setting.modelId}]\nbase_url = ${JSON.stringify(setting.baseUrl)}\nmodel_name = ${JSON.stringify(setting.modelId)}\napi_backend = "chat_completions"\nenv_key = ${JSON.stringify(preset.envKey)}`]
  })
  const managed = `${start}\n${blocks.join("\n\n")}\n${end}`
  const pattern = new RegExp(`${start}[\\s\\S]*?${end}`, "m")
  const next = pattern.test(existing) ? existing.replace(pattern, managed) : `${existing.trimEnd()}\n\n${managed}\n`
  mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, next, { mode: 0o600 })
}

export function saveProviderSecret(id: string, value: string): void {
  const preset = PROVIDER_PRESETS.find((entry) => entry.id === id)
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

export function providerSecretEnvironment(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const record of Object.values(records())) {
    try { env[record.envKey] = safeStorage.decryptString(Buffer.from(record.encrypted, "base64")) } catch { /* never expose broken secrets */ }
  }
  return env
}
