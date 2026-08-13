/**
 * Official provider OAuth helpers.
 *
 * xAI signs in with `grok login --oauth` (not `grok --oauth`).
 * MiniMax uses `mmx auth login`. OpenAI Codex uses Hermes
 * `hermes auth add openai-codex --type oauth`.
 *
 * Status probes never return tokens, refresh tokens, or API keys.
 */
import { existsSync, readFileSync } from "fs"
import { homedir } from "os"
import { join } from "path"

export type OAuthProviderId = "xai" | "openai" | "minimax"

export type OAuthProviderStatus = {
  id: OAuthProviderId
  label: string
  signedIn: boolean
  helperAvailable: boolean
  helperCommand?: string
  account?: string
  expiresAt?: string
  detail: string
}

export type OAuthStatusSnapshot = {
  providers: OAuthProviderStatus[]
}

export type OAuthLaunchSpec = {
  helper: "grok" | "mmx" | "hermes"
  args: string[]
  probeArgs: string[]
  missingMessage: string
  startedMessage: string
}

const PROVIDER_LABEL: Record<OAuthProviderId, string> = {
  xai: "xAI / Grok",
  openai: "OpenAI Codex",
  minimax: "MiniMax",
}

export function oauthProviderLabel(id: OAuthProviderId): string {
  return PROVIDER_LABEL[id]
}

export function oauthLaunchSpec(provider: OAuthProviderId): OAuthLaunchSpec {
  if (provider === "xai") {
    return {
      helper: "grok",
      args: ["login", "--oauth"],
      probeArgs: ["login", "--help"],
      missingMessage: "Grok Build CLI is required for xAI OAuth. Install grok or set the CLI path in Settings.",
      startedMessage: "xAI OAuth opened in Terminal (`grok login --oauth`). Finish browser sign-in at auth.x.ai, then return here.",
    }
  }
  if (provider === "minimax") {
    return {
      helper: "mmx",
      args: ["auth", "login", "--recommend", "--region=global"],
      probeArgs: ["auth", "--help"],
      missingMessage: "MiniMax’s official mmx CLI is required for this OAuth flow. Install mmx, then try again.",
      startedMessage: "MiniMax OAuth opened in Terminal (`mmx auth login`). Finish device sign-in, then return here.",
    }
  }
  return {
    helper: "hermes",
    args: ["auth", "add", "openai-codex", "--type", "oauth"],
    probeArgs: ["auth", "--help"],
    missingMessage: "Hermes Agent is required for OpenAI Codex OAuth. Install Hermes, then try again.",
    startedMessage: "OpenAI Codex OAuth opened in Terminal (`hermes auth add openai-codex`). Finish ChatGPT sign-in, then return here.",
  }
}

export function helperSearchPaths(name: string, home = homedir()): string[] {
  return [
    join(home, ".npm-global", "bin", name),
    join(home, ".local", "bin", name),
    join(home, ".hermes", "bin", name),
    join("/opt/homebrew/bin", name),
    join("/usr/local/bin", name),
  ]
}

export function firstExistingHelper(name: string, home = homedir(), exists: (path: string) => boolean = existsSync): string | undefined {
  return helperSearchPaths(name, home).find((path) => exists(path))
}

export type XaiSessionSummary = {
  signedIn: boolean
  account?: string
  expiresAt?: string
  via?: "session" | "api-key"
}

type XaiSession = {
  email?: string
  refreshToken?: boolean
  key?: boolean
  expiresAtMs?: number
  expiresAt?: string
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

function parseExpiry(value: unknown): { ms?: number; iso?: string } {
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value < 1e12 ? value * 1000 : value
    return { ms, iso: new Date(ms).toISOString() }
  }
  if (typeof value === "string" && value.trim()) {
    const ms = Date.parse(value)
    if (Number.isFinite(ms)) return { ms, iso: new Date(ms).toISOString() }
  }
  return {}
}

function readXaiSession(value: unknown): XaiSession | undefined {
  const record = asRecord(value)
  if (!record) return undefined
  const email = typeof record.email === "string" && record.email.includes("@") ? record.email : undefined
  const refreshToken = typeof record.refresh_token === "string" && record.refresh_token.length > 0
  const key = typeof record.key === "string" && record.key.length > 0
  const access = typeof record.access_token === "string" && record.access_token.length > 0
  if (!refreshToken && !key && !access && !email) return undefined
  const expiry = parseExpiry(record.expires_at ?? record.expiresAt)
  return { email, refreshToken, key: key || access, expiresAtMs: expiry.ms, expiresAt: expiry.iso }
}

export function summarizeXaiAuth(payload: unknown, now = Date.now(), env: NodeJS.ProcessEnv = process.env): XaiSessionSummary {
  const root = asRecord(payload)
  const sessions: XaiSession[] = []
  if (root) {
    const self = readXaiSession(root)
    if (self) sessions.push(self)
    for (const value of Object.values(root)) {
      const session = readXaiSession(value)
      if (session) sessions.push(session)
    }
  }
  const usable = sessions.find((session) => session.refreshToken || session.key || (session.expiresAtMs !== undefined && session.expiresAtMs > now))
  if (usable) {
    return { signedIn: true, account: usable.email, expiresAt: usable.expiresAt, via: "session" }
  }
  if (env.XAI_API_KEY?.trim()) {
    return { signedIn: true, account: "API key", via: "api-key" }
  }
  return { signedIn: false }
}

export function readXaiAuthFile(path = join(homedir(), ".grok", "auth.json")): unknown {
  if (!existsSync(path)) return undefined
  try {
    return JSON.parse(readFileSync(path, "utf8")) as unknown
  } catch {
    return undefined
  }
}

export function parseMmxAuthStatus(stdout: string): { signedIn: boolean; account?: string; expiresAt?: string; method?: string } {
  const text = stdout.trim()
  if (!text) return { signedIn: false }
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>
    const method = typeof parsed.method === "string" ? parsed.method : undefined
    const expiry = parseExpiry(parsed.token_expires ?? parsed.expires_at ?? parsed.expiresAt)
    const account = typeof parsed.account === "string" ? parsed.account
      : typeof parsed.email === "string" ? parsed.email
      : method
    if (method || expiry.iso || parsed.source) {
      return { signedIn: true, account, expiresAt: expiry.iso, method }
    }
  } catch {
    if (/logged in|authenticated|oauth|signed in/i.test(text) && !/not (logged|authenticated|signed)/i.test(text)) {
      return { signedIn: true }
    }
  }
  return { signedIn: false }
}

export function describeOAuthProvider(input: {
  id: OAuthProviderId
  signedIn: boolean
  helperAvailable: boolean
  helperCommand?: string
  account?: string
  expiresAt?: string
  via?: string
  error?: string
}): OAuthProviderStatus {
  const label = oauthProviderLabel(input.id)
  if (!input.helperAvailable) {
    return {
      id: input.id,
      label,
      signedIn: false,
      helperAvailable: false,
      helperCommand: input.helperCommand,
      detail: input.error || `${label} helper is not available.`,
    }
  }
  if (input.signedIn) {
    const account = input.account ? ` · ${input.account}` : ""
    const via = input.via === "api-key" ? " via API key" : ""
    return {
      id: input.id,
      label,
      signedIn: true,
      helperAvailable: true,
      helperCommand: input.helperCommand,
      account: input.account,
      expiresAt: input.expiresAt,
      detail: `Signed in${via}${account}`,
    }
  }
  return {
    id: input.id,
    label,
    signedIn: false,
    helperAvailable: true,
    helperCommand: input.helperCommand,
    detail: input.error || `Not signed in. Use Sign in with ${label.split(" / ")[0]}.`,
  }
}
