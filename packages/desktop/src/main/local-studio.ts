import { getStore } from "./store"

export type LocalStudioSnapshot = {
  configured: boolean
  reachable: boolean
  baseUrl: string
  health?: unknown
  status?: unknown
  gpus?: unknown
  error?: string
}

function normalizedURL(value: string): string {
  const url = new URL(value.trim())
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Local Studio URL must use http or https.")
  return url.toString().replace(/\/$/, "")
}

async function getJSON(baseUrl: string, path: string): Promise<unknown> {
  const response = await fetch(`${baseUrl}${path}`, { signal: AbortSignal.timeout(5_000) })
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`)
  return response.json()
}

/**
 * Read-only Local Studio controller client. It deliberately does not call any
 * model lifecycle endpoint; launch/evict/download remain explicit user actions
 * in Local Studio itself until a reviewed command policy exists.
 */
export class LocalStudioController {
  getBaseURL(): string { return getStore().get("localStudio.baseUrl") }

  setBaseURL(value: string): string {
    const baseUrl = value.trim() ? normalizedURL(value) : ""
    getStore().set("localStudio.baseUrl", baseUrl)
    return baseUrl
  }

  async snapshot(): Promise<LocalStudioSnapshot> {
    const baseUrl = this.getBaseURL()
    if (!baseUrl) return { configured: false, reachable: false, baseUrl }
    try {
      const [health, status, gpus] = await Promise.all([
        getJSON(baseUrl, "/health"),
        getJSON(baseUrl, "/status"),
        getJSON(baseUrl, "/gpus"),
      ])
      return { configured: true, reachable: true, baseUrl, health, status, gpus }
    } catch (error) {
      return { configured: true, reachable: false, baseUrl, error: error instanceof Error ? error.message : String(error) }
    }
  }
}
