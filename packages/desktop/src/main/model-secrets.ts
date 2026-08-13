import { safeStorage } from "electron"
import { getStore } from "./store"
import { mkdir, readFile, writeFile, rename, unlink } from "fs/promises"
import { homedir } from "os"
import { dirname, join } from "path"
import { randomUUID } from "crypto"
import { removeLegacyCodexBridgeTables } from "./model-config-utils"
import { buildManagedModelsBlock, spliceManagedModels, type ExtraManagedModel } from "./model-config-block"
import { write as writeLog } from "./logging"

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
let nimCompat: ExtraManagedModel[] = []

export function listProviderSecrets() {
  const saved = records()
  const settings = getStore().get("grok.providerSettings", {})
  return providers().map((preset) => ({ ...preset, ...settings[preset.id], modelId: settings[preset.id]?.modelId ?? "", configured: Boolean(saved[preset.id]) }))
}

export async function addCustomProvider(label: string, baseUrl: string, modelId: string): Promise<void> {
  const cleanLabel = label.trim(), cleanModel = modelId.trim()
  if (!cleanLabel || !cleanModel) throw new Error("Provider name and model ID are required")
  if (!/^[A-Za-z0-9_-]+$/.test(cleanModel)) throw new Error("Invalid model ID")
  const id = `custom-${cleanModel.toLowerCase()}`
  if (providers().some((provider) => provider.id === id)) throw new Error("That provider already exists")
  const envKey = `GROK_PROVIDER_${cleanModel.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_API_KEY`
  getStore().set("grok.customProviders", [...getStore().get("grok.customProviders", []), { id, label: cleanLabel, envKey, baseUrl }])
  await saveProviderSettings(id, baseUrl, cleanModel)
}

export async function removeCustomProvider(id: string): Promise<void> {
  if (!id.startsWith("custom-")) throw new Error("Built-in providers cannot be removed")
  getStore().set("grok.customProviders", getStore().get("grok.customProviders", []).filter((entry: { id: string }) => entry.id !== id))
  removeProviderSecret(id)
  const settings = getStore().get("grok.providerSettings", {}); delete settings[id]; getStore().set("grok.providerSettings", settings); await writeManagedModels(settings)
}

export async function saveProviderSettings(id: string, baseUrl: string, modelId: string): Promise<void> {
  const preset = providers().find((entry) => entry.id === id)
  if (!preset) throw new Error("Unknown provider")
  const url = new URL(baseUrl.trim())
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error("Provider URL must use HTTP or HTTPS")
  const cleanModel = modelId.trim()
  if (cleanModel && !/^[A-Za-z0-9_./:-]+$/.test(cleanModel)) throw new Error("Model ID contains unsupported characters")
  const settings = getStore().get("grok.providerSettings", {})
  settings[id] = { baseUrl: url.toString().replace(/\/$/, ""), modelId: cleanModel }
  getStore().set("grok.providerSettings", settings)
  await writeManagedModels(settings)
}

/**
 * Build the next managed block for `~/.grok/config.toml` from the supplied
 * provider settings + the live codex OAuth bridge snapshot. Thin re-export
 * over `model-config-block.ts` so the persisted provider store layout stays
 * decoupled from the safe-storage / IPC side and can be tested in isolation.
 */
export const buildManagedModelsBlockForProviders = (
  settings: Record<string, { baseUrl: string; modelId: string }>,
  codexSnapshot: { baseUrl: string; models: CodexOAuthModel[] } | null,
  extras: ExtraManagedModel[] = nimCompat,
): string => buildManagedModelsBlock(providers(), settings, codexSnapshot, extras)

// Single-flight serialised queue. The previous implementation called
// `writeManagedModels` synchronously inside every `saveProviderSettings`
// / `removeCustomProvider` / `configureCodexOAuthModels` invocation; on
// slow disks that stalls the main process and on crash can leave the
// managed block half-written. Async + atomic + serialised is the floor.
let writes: Promise<unknown> = Promise.resolve()
function enqueueWrite(task: () => Promise<void>): Promise<void> {
  writes = writes.catch(() => undefined).then(task)
  return writes.then(() => undefined)
}

export function writeManagedModels(settings: Record<string, { baseUrl: string; modelId: string }>): Promise<void> {
  return enqueueWrite(async () => {
    const path = join(homedir(), ".grok", "config.toml")
    let existing = ""
    try {
      existing = await readFile(path, "utf8")
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    }
    const cleaned = removeLegacyCodexBridgeTables(existing)
    const managedBlock = buildManagedModelsBlockForProviders(settings, codexOAuth)
    const next = spliceManagedModels(cleaned, managedBlock)
    await mkdir(dirname(path), { recursive: true })
    // Atomic temp + rename so a power loss cannot leave a partial file
    // with an open managed block. Falls back to a direct write when the
    // destination does not yet exist (no file to atomically replace).
    const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`
    try {
      await writeFile(temporary, next, { encoding: "utf8", mode: 0o600 })
      await rename(temporary, path)
    } catch (error) {
      await unlink(temporary).catch(() => undefined)
      throw error
    }
    // Post-write verify: the marker block must be present, otherwise we
    // silently lost the user's other config (e.g. credentials, model
    // aliases they typed by hand). A logged warn beats a silent failure.
    try {
      const reread = await readFile(path, "utf8")
      if (!reread.includes("# BEGIN GROK BUILD DESKTOP MANAGED PROVIDERS") || !reread.includes("# END GROK BUILD DESKTOP MANAGED PROVIDERS")) {
        writeLog("warn", "writeManagedModels post-write verify: managed markers missing after rewrite")
      }
    } catch (error) {
      writeLog("warn", `writeManagedModels post-write verify failed: ${String(error)}`)
    }
  })
}

// Back-compat for tests + IPC handlers that haven't been migrated yet.
// The desktop never relied on the synchronous return value.
export function writeManagedModelsSyncUnavailable(): never {
  throw new Error("writeManagedModels is async only; await writeManagedModels(...)")
}

export async function configureCodexOAuthModels(baseUrl: string, models: CodexOAuthModel[]): Promise<void> {
  codexOAuth = { baseUrl, models }
  await writeManagedModels(getStore().get("grok.providerSettings", {}))
}

export async function configureNimCompatModel(entry: ExtraManagedModel | ExtraManagedModel[] | null): Promise<void> {
  nimCompat = !entry ? [] : Array.isArray(entry) ? entry : [entry]
  await writeManagedModels(getStore().get("grok.providerSettings", {}))
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
