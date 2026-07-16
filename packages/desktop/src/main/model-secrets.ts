import { safeStorage } from "electron"
import { getStore } from "./store"

export const PROVIDER_PRESETS = [
  { id: "lm-studio", label: "LM Studio", envKey: "LM_STUDIO_API_KEY", baseUrl: "http://localhost:1234/v1" },
  { id: "ods", label: "ODS", envKey: "ODS_API_KEY", baseUrl: "http://localhost:8080/v1" },
  { id: "minimax", label: "MiniMax", envKey: "MINIMAX_API_KEY", baseUrl: "https://api.minimax.io/v1" },
] as const

type SecretRecord = { label: string; envKey: string; encrypted: string }
const records = (): Record<string, SecretRecord> => getStore().get("grok.providerSecrets", {})

export function listProviderSecrets() {
  const saved = records()
  return PROVIDER_PRESETS.map((preset) => ({ ...preset, configured: Boolean(saved[preset.id]) }))
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
