import { execFile } from "child_process"
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "http"
import { randomBytes } from "crypto"
import { existsSync } from "fs"
import { homedir } from "os"
import { join } from "path"
import { promisify } from "util"

const execFileAsync = promisify(execFile)
const CODEX_MODELS_URL = "https://chatgpt.com/backend-api/codex/models?client_version=1.0.0"
const MAX_REQUEST_BYTES = 24 * 1024 * 1024
const HERMES_CREDENTIAL_SCRIPT = `
import base64, json
from hermes_cli.auth import resolve_codex_runtime_credentials
c = resolve_codex_runtime_credentials()
t = c.get("api_key", "")
account = ""
try:
    p = t.split(".")[1]; p += "=" * (-len(p) % 4)
    claims = json.loads(base64.urlsafe_b64decode(p))
    account = claims.get("https://api.openai.com/auth", {}).get("chatgpt_account_id", "")
except Exception:
    pass
print(json.dumps({"token": t, "base_url": c.get("base_url", ""), "account_id": account}))
`.trim()

type Credentials = { token: string; base_url: string; account_id?: string }
export type CodexOAuthModel = { id: string; contextWindow?: number }

function hermesPython(): string {
  const candidates = [
    join(homedir(), ".hermes", "hermes-agent", "venv", "bin", "python"),
    join(homedir(), ".hermes", "hermes-agent", ".venv", "bin", "python"),
  ]
  const found = candidates.find(existsSync)
  if (!found) throw new Error("Hermes Agent’s Python environment was not found. Install or update Hermes, then sign in again.")
  return found
}

function codexHeaders(credentials: Credentials): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${credentials.token}`,
    "Content-Type": "application/json",
    "User-Agent": "codex_cli_rs/0.0.0 (Grok Build Desktop)",
    originator: "codex_cli_rs",
  }
  if (credentials.account_id) headers["ChatGPT-Account-ID"] = credentials.account_id
  return headers
}

async function readBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > MAX_REQUEST_BYTES) throw new Error("Codex request is too large")
    chunks.push(buffer)
  }
  return Buffer.concat(chunks)
}

function sanitizeResponsesBody(body: Buffer): Buffer {
  const payload = JSON.parse(body.toString("utf8")) as Record<string, unknown>
  for (const key of ["max_output_tokens", "metadata", "prompt_cache_retention", "service_tier", "temperature", "top_p"]) delete payload[key]
  if (payload.text && typeof payload.text === "object" && !Array.isArray(payload.text)) {
    const text = { ...(payload.text as Record<string, unknown>) }
    delete text.format
    if (Object.keys(text).length) payload.text = text
    else delete payload.text
  }
  // The public Responses API accepts system/developer input items, but the
  // ChatGPT Codex transport requires those instructions in the top-level
  // `instructions` field (the same normalization OpenClaw performs).
  if (Array.isArray(payload.input)) {
    const instructions: string[] = typeof payload.instructions === "string" && payload.instructions.trim() ? [payload.instructions] : []
    payload.input = payload.input.filter((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return true
      const message = item as Record<string, unknown>
      if (message.role !== "system" && message.role !== "developer") return true
      if (typeof message.content === "string") instructions.push(message.content)
      else if (Array.isArray(message.content)) {
        for (const part of message.content) {
          if (part && typeof part === "object" && typeof (part as Record<string, unknown>).text === "string") instructions.push(String((part as Record<string, unknown>).text))
        }
      }
      return false
    })
    if (instructions.length) payload.instructions = instructions.join("\n\n")
  }
  payload.store = false
  return Buffer.from(JSON.stringify(payload))
}

export class CodexOAuthBridge {
  private server: Server | null = null
  private port = 0
  private readonly secret = randomBytes(32).toString("base64url")
  private cachedCredentials: { value: Credentials; at: number } | null = null
  private cachedModels: { value: CodexOAuthModel[]; at: number } | null = null

  environment(): NodeJS.ProcessEnv { return this.server ? { GROK_CODEX_OAUTH_BRIDGE_KEY: this.secret } : {} }
  baseUrl(): string { return `http://127.0.0.1:${this.port}/v1` }

  async available(): Promise<boolean> {
    try { await this.credentials(false); return true } catch { return false }
  }

  async start(): Promise<void> {
    if (this.server) return
    await this.credentials(false)
    this.server = createServer((request, response) => void this.handle(request, response))
    await new Promise<void>((resolve, reject) => {
      this.server!.once("error", reject)
      this.server!.listen(0, "127.0.0.1", () => resolve())
    })
    const address = this.server.address()
    if (!address || typeof address === "string") throw new Error("Could not start the local Codex OAuth bridge")
    this.port = address.port
  }

  async stop(): Promise<void> {
    const server = this.server
    this.server = null
    this.port = 0
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
  }

  async models(force = false): Promise<CodexOAuthModel[]> {
    await this.start()
    if (!force && this.cachedModels && Date.now() - this.cachedModels.at < 5 * 60_000) return this.cachedModels.value
    const credentials = await this.credentials(force)
    let response = await fetch(CODEX_MODELS_URL, { headers: codexHeaders(credentials), signal: AbortSignal.timeout(12_000) })
    if (response.status === 401 && !force) {
      const refreshed = await this.credentials(true)
      response = await fetch(CODEX_MODELS_URL, { headers: codexHeaders(refreshed), signal: AbortSignal.timeout(12_000) })
    }
    if (!response.ok) throw new Error(`OpenAI Codex model discovery failed (HTTP ${response.status})`)
    const payload = await response.json() as { models?: Array<{ slug?: unknown; visibility?: unknown; context_window?: unknown; priority?: unknown }> }
    const models = (payload.models || [])
      .filter((entry) => typeof entry.slug === "string" && !["hide", "hidden"].includes(String(entry.visibility || "").toLowerCase()))
      .sort((a, b) => Number(a.priority ?? 10_000) - Number(b.priority ?? 10_000))
      .map((entry) => ({ id: String(entry.slug), contextWindow: typeof entry.context_window === "number" ? entry.context_window : undefined }))
    this.cachedModels = { value: models, at: Date.now() }
    return models
  }

  private async credentials(force: boolean): Promise<Credentials> {
    if (!force && this.cachedCredentials && Date.now() - this.cachedCredentials.at < 30_000) return this.cachedCredentials.value
    const { stdout } = await execFileAsync(hermesPython(), ["-c", HERMES_CREDENTIAL_SCRIPT], { timeout: 30_000, maxBuffer: 100_000 })
    const credentials = JSON.parse(stdout) as Credentials
    if (!credentials.token || !credentials.base_url) throw new Error("Hermes did not return usable OpenAI Codex OAuth credentials")
    credentials.base_url = credentials.base_url.replace(/\/$/, "")
    this.cachedCredentials = { value: credentials, at: Date.now() }
    return credentials
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      if (request.headers.authorization !== `Bearer ${this.secret}`) { response.writeHead(401); response.end("Unauthorized"); return }
      const path = new URL(request.url || "/", this.baseUrl()).pathname
      if (request.method === "GET" && path === "/v1/models") {
        const models = await this.models()
        response.writeHead(200, { "Content-Type": "application/json" })
        response.end(JSON.stringify({ object: "list", data: models.map((model) => ({ id: model.id, object: "model", owned_by: "openai-codex" })) }))
        return
      }
      if (request.method !== "POST" || path !== "/v1/responses") { response.writeHead(404); response.end("Not found"); return }
      const body = sanitizeResponsesBody(await readBody(request))
      let credentials = await this.credentials(false)
      let upstream = await this.forward(credentials, body, request.headers.accept)
      if (upstream.status === 401) {
        credentials = await this.credentials(true)
        upstream = await this.forward(credentials, body, request.headers.accept)
      }
      response.writeHead(upstream.status, Object.fromEntries([...upstream.headers].filter(([name]) => !["content-encoding", "content-length", "transfer-encoding", "connection"].includes(name.toLowerCase()))))
      if (!upstream.body) { response.end(); return }
      const reader = upstream.body.getReader()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (!response.write(Buffer.from(value))) await new Promise<void>((resolve) => response.once("drain", resolve))
      }
      response.end()
    } catch (error) {
      if (!response.headersSent) response.writeHead(502, { "Content-Type": "application/json" })
      response.end(JSON.stringify({ error: { message: error instanceof Error ? error.message : String(error), type: "codex_oauth_bridge_error" } }))
    }
  }

  private forward(credentials: Credentials, body: Buffer, accept?: string): Promise<Response> {
    return fetch(`${credentials.base_url}/responses`, {
      method: "POST",
      headers: { ...codexHeaders(credentials), Accept: accept || "text/event-stream" },
      body,
      signal: AbortSignal.timeout(15 * 60_000),
    })
  }
}
