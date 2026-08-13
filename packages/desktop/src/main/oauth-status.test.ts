import assert from "node:assert/strict"
import test from "node:test"
import {
  describeOAuthProvider,
  firstExistingHelper,
  helperSearchPaths,
  oauthLaunchSpec,
  parseMmxAuthStatus,
  summarizeXaiAuth,
} from "./oauth-status.ts"

test("xAI OAuth uses grok login --oauth, not grok --oauth", () => {
  const spec = oauthLaunchSpec("xai")
  assert.deepEqual(spec.args, ["login", "--oauth"])
  assert.equal(spec.helper, "grok")
  assert.ok(!spec.args.includes("--oauth") || spec.args[0] === "login")
})

test("MiniMax and OpenAI OAuth keep their official helper commands", () => {
  assert.deepEqual(oauthLaunchSpec("minimax").args, ["auth", "login", "--recommend", "--region=global"])
  assert.deepEqual(oauthLaunchSpec("openai").args, ["auth", "add", "openai-codex", "--type", "oauth"])
})

test("summarizeXaiAuth reads issuer-keyed sessions without exposing secrets", () => {
  const summary = summarizeXaiAuth({
    "https://auth.x.ai::client": {
      auth_mode: "oauth",
      email: "dev@example.com",
      expires_at: "2099-01-01T00:00:00.000Z",
      refresh_token: "refresh-secret",
      key: "access-secret",
    },
  }, Date.parse("2026-08-12T00:00:00.000Z"), {})
  assert.equal(summary.signedIn, true)
  assert.equal(summary.account, "dev@example.com")
  assert.equal(summary.via, "session")
  assert.equal(JSON.stringify(summary).includes("refresh-secret"), false)
  assert.equal(JSON.stringify(summary).includes("access-secret"), false)
})

test("summarizeXaiAuth treats a refreshable expired session as signed in", () => {
  const summary = summarizeXaiAuth({
    session: {
      email: "dev@example.com",
      expires_at: "2020-01-01T00:00:00.000Z",
      refresh_token: "refresh-secret",
    },
  }, Date.parse("2026-08-12T00:00:00.000Z"), {})
  assert.equal(summary.signedIn, true)
})

test("summarizeXaiAuth falls back to XAI_API_KEY when no session exists", () => {
  const summary = summarizeXaiAuth({}, Date.now(), { XAI_API_KEY: "xai-test" })
  assert.equal(summary.signedIn, true)
  assert.equal(summary.via, "api-key")
  assert.equal(summary.account, "API key")
})

test("summarizeXaiAuth reports signed out for an empty auth file", () => {
  assert.equal(summarizeXaiAuth({}, Date.now(), {}).signedIn, false)
})

test("parseMmxAuthStatus reads official JSON status", () => {
  const parsed = parseMmxAuthStatus(JSON.stringify({
    method: "oauth",
    source: "config.json",
    token_expires: "2026-08-14T23:57:55.612Z",
  }))
  assert.equal(parsed.signedIn, true)
  assert.equal(parsed.method, "oauth")
  assert.ok(parsed.expiresAt)
})

test("describeOAuthProvider never claims signed in when the helper is missing", () => {
  const row = describeOAuthProvider({
    id: "openai",
    signedIn: true,
    helperAvailable: false,
    error: "Hermes Agent is required for OpenAI Codex OAuth.",
  })
  assert.equal(row.signedIn, false)
  assert.match(row.detail, /Hermes/)
})

test("helper search prefers user-local bins over PATH names", () => {
  const paths = helperSearchPaths("mmx", "/Users/demo")
  const normalized = (path: string | undefined) => path?.replaceAll("\\", "/")
  assert.ok(normalized(paths[0])?.endsWith("/.npm-global/bin/mmx"))
  assert.equal(normalized(firstExistingHelper("mmx", "/Users/demo", (path) => Boolean(normalized(path)?.endsWith("/.local/bin/mmx")))), "/Users/demo/.local/bin/mmx")
})
