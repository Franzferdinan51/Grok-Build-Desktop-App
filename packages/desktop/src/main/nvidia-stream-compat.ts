/**
 * NVIDIA NIM streams `"usage": null` (and extra `nvext` / null fingerprint
 * fields) on every intermediate Chat Completions chunk. Grok Build's Rust
 * serde schema requires `usage` as u32s, so the turn dies with
 * `serialization error: invalid type: null, expected u32`.
 *
 * This is a local compatibility proxy, not a second agent runtime. Grok
 * Build still owns inference; the proxy only rewrites the stream so the
 * documented CLI can parse it.
 */
import http from "node:http"
import https from "node:https"
import { URL } from "node:url"

export const ZERO_USAGE = {
  prompt_tokens: 0,
  completion_tokens: 0,
  total_tokens: 0,
  input_tokens: 0,
  output_tokens: 0,
  thought_tokens: 0,
  reasoning_tokens: 0,
  cached_read_tokens: 0,
  cached_write_tokens: 0,
}

function stripNullUsageFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripNullUsageFields)
  if (!value || typeof value !== "object") return value
  const cleaned: Record<string, unknown> = {}
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    // Grok Build models usage counters as integers. Some OpenAI-compatible
    // NVIDIA responses include optional counters such as audio_tokens with a
    // JSON null value, which serde rejects even though omitting them is valid.
    if (nested === null) continue
    cleaned[key] = stripNullUsageFields(nested)
  }
  return cleaned
}

export function rewriteNvidiaObject(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value
  const obj = value as Record<string, unknown>
  if ("nvext" in obj) delete obj.nvext
  if (obj.service_tier === null) delete obj.service_tier
  if (obj.system_fingerprint === null) delete obj.system_fingerprint
  if (obj.usage === null) obj.usage = { ...ZERO_USAGE }
  else if (obj.usage && typeof obj.usage === "object") obj.usage = stripNullUsageFields(obj.usage)
  return obj
}

export function rewriteNvidiaSseEvent(rawEvent: string): string {
  const lines = rawEvent.split("\n")
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (!line.startsWith("data:")) continue
    const payload = line.slice(5).trimStart()
    if (!payload || payload === "[DONE]") continue
    try {
      lines[index] = `data: ${JSON.stringify(rewriteNvidiaObject(JSON.parse(payload)))}`
    } catch { /* leave malformed lines alone */ }
  }
  return `${lines.join("\n")}\n\n`
}

export function rewriteNvidiaSseBuffer(buffer: string): { flushed: string; rest: string } {
  const parts = buffer.split("\n\n")
  const rest = parts.pop() || ""
  return { flushed: parts.map(rewriteNvidiaSseEvent).join(""), rest }
}

const DEFAULT_UPSTREAM = "https://integrate.api.nvidia.com"

type ProxyHandle = { port: number; close: () => Promise<void> }

let active: Promise<ProxyHandle> | null = null

export async function ensureNvidiaCompatProxy(upstream = DEFAULT_UPSTREAM): Promise<ProxyHandle> {
  if (!active) active = startProxy(upstream)
  try { return await active }
  catch (error) {
    active = null
    throw error
  }
}

function startProxy(upstream: string): Promise<ProxyHandle> {
  const target = new URL(upstream)
  const agent = target.protocol === "https:" ? https : http
  return new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      const path = request.url || "/"
      const headers: http.OutgoingHttpHeaders = { ...request.headers, host: target.host }
      delete headers.connection
      delete headers["keep-alive"]
      delete headers["transfer-encoding"]
      const proxy = agent.request({
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || (target.protocol === "https:" ? 443 : 80),
        method: request.method,
        path,
        headers,
      }, (upstreamResponse) => {
        const contentType = String(upstreamResponse.headers["content-type"] || "")
        const streaming = contentType.includes("text/event-stream")
        const outHeaders = { ...upstreamResponse.headers }
        delete outHeaders.connection
        delete outHeaders["keep-alive"]
        delete outHeaders["transfer-encoding"]
        response.writeHead(upstreamResponse.statusCode || 502, outHeaders)
        if (!streaming) {
          upstreamResponse.pipe(response)
          return
        }
        let rest = ""
        upstreamResponse.setEncoding("utf8")
        upstreamResponse.on("data", (chunk: string) => {
          const rewritten = rewriteNvidiaSseBuffer(rest + chunk)
          rest = rewritten.rest
          if (rewritten.flushed) response.write(rewritten.flushed)
        })
        upstreamResponse.on("end", () => {
          if (rest) response.write(rewriteNvidiaSseEvent(rest))
          response.end()
        })
        upstreamResponse.on("error", () => response.end())
      })
      proxy.on("error", (error) => {
        if (!response.headersSent) response.writeHead(502, { "content-type": "text/plain" })
        response.end(`NVIDIA compatibility proxy failed: ${error.message}`)
      })
      request.pipe(proxy)
    })
    server.on("error", (error) => reject(error))
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      if (!address || typeof address === "string") {
        reject(new Error("NVIDIA compatibility proxy did not bind a TCP port"))
        return
      }
      resolve({
        port: address.port,
        close: () => new Promise((done) => server.close(() => done())),
      })
    })
  })
}
