/**
 * Read `[model.<id>]` tables from Grok Build's config.toml so the desktop
 * can tell which catalog entries already point at NVIDIA NIM.
 * API keys are kept in memory for the child env only and never logged.
 */

export type GrokModelTable = {
  id: string
  model: string
  baseUrl: string
  envKey?: string
  contextWindow?: number
  apiKey?: string
}

const NVIDIA_HOSTS = ["integrate.api.nvidia.com", "inference.api.nvidia.com", "build.nvidia.com"]

export function isNvidiaModelId(id: string): boolean {
  const value = id.trim().toLowerCase()
  return Boolean(value) && (
    value.includes("nemotron")
    || value.startsWith("nvidia/")
    || value.startsWith("nvidia-")
    || value.endsWith("-nvidia")
    || value === "nvidia-build"
  )
}

export function isNvidiaHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return NVIDIA_HOSTS.some((entry) => host === entry || host.endsWith(`.${entry}`))
  } catch {
    return /nvidia\.com/i.test(url)
  }
}

export function parseGrokModelTables(toml: string): GrokModelTable[] {
  const tables: GrokModelTable[] = []
  const blocks = toml.split(/(?=^\s*\[model\.)/m)
  for (const block of blocks) {
    const header = block.match(/^\s*\[model\.([^\]]+)\]\s*$/m)
    if (!header) continue
    const id = header[1]!.trim()
    if (!id) continue
    const model = readTomlString(block, "model") || readTomlString(block, "model_name") || id
    const baseUrl = readTomlString(block, "base_url")
    const envKey = readTomlString(block, "env_key")
    const apiKey = readTomlString(block, "api_key")
    const contextWindow = readTomlNumber(block, "context_window")
    tables.push({ id, model, baseUrl: baseUrl || "", envKey, apiKey, contextWindow })
  }
  return tables
}

export function needsNvidiaStreamCompat(modelId: string, tables: GrokModelTable[]): boolean {
  const table = tables.find((entry) => entry.id === modelId)
  if (table?.baseUrl) return isNvidiaHost(table.baseUrl)
  return isNvidiaModelId(modelId)
}

export function resolveNvidiaUpstream(modelId: string, tables: GrokModelTable[]): GrokModelTable {
  const table = tables.find((entry) => entry.id === modelId)
  if (table) return table
  return { id: modelId, model: modelId.includes("/") ? modelId : modelId, baseUrl: "https://integrate.api.nvidia.com/v1" }
}

function readTomlString(block: string, key: string): string | undefined {
  const match = block.match(new RegExp(`^\\s*${key}\\s*=\\s*("(?:\\\\.|[^"\\\\])*"|'(?:\\\\.|[^'\\\\])*')\\s*$`, "m"))
  if (!match) return undefined
  try { return JSON.parse(match[1]!.replace(/^'/, "\"").replace(/'$/, "\"")) as string }
  catch { return match[1]!.slice(1, -1) }
}

function readTomlNumber(block: string, key: string): number | undefined {
  const match = block.match(new RegExp(`^\\s*${key}\\s*=\\s*(\\d+)\\s*$`, "m"))
  if (!match) return undefined
  const value = Number(match[1])
  return Number.isFinite(value) ? value : undefined
}
