/**
 * Renderer-safe mirror of `main/app-actions.ts` schema validators.
 *
 * The renderer cannot import from `main/` because that pulls `electron`,
 * which is blocked in sandboxed renderer builds. The contract is
 * replicated here; both implementations are exercised by `smoke.mjs`
 * so a divergence cannot ship silently.
 */

import { isSafeExternalUrl } from "../shared/url-safety.ts"

const MAX_NAME_CHARS = 120
const MAX_PROMPT_CHARS = 20_000
const MAX_URL_CHARS = 2_000

export type AppAction =
  | { type: "preview.open" }
  | { type: "browser.open"; url: string }
  | { type: "desktop.status" }
  | { type: "schedule.create"; name: string; prompt: string; runAt: number; repeatMinutes?: number }

export type AppActionResult =
  | { ok: true; notice?: string; action: AppAction }
  | { ok: false; error: string }

export function validateAppAction(raw: unknown): AppActionResult {
  if (raw === null || typeof raw !== "object") return { ok: false, error: "Action is not an object" }
  const action = raw as Record<string, unknown>
  const type = action.type
  if (type !== "preview.open" && type !== "browser.open" && type !== "desktop.status" && type !== "schedule.create") {
    return { ok: false, error: `Unknown action type: ${String(type)}` }
  }
  if (type === "preview.open" || type === "desktop.status") return { ok: true, action: { type } }
  if (type === "browser.open") {
    const url = action.url
    if (typeof url !== "string" || !url) return { ok: false, error: "browser.open url is required" }
    const normalizedUrl = url.trim()
    if (normalizedUrl.length > MAX_URL_CHARS) return { ok: false, error: `browser.open url exceeds ${MAX_URL_CHARS} chars` }
    if (!isSafeExternalUrl(normalizedUrl)) return { ok: false, error: "browser.open url is not http(s)" }
    return { ok: true, action: { type: "browser.open", url: normalizedUrl } }
  }
  const name = action.name
  const prompt = action.prompt
  const runAt = action.runAt
  const repeatMinutes = action.repeatMinutes
  const notices: string[] = []
  if (typeof name !== "string" || !name.trim()) return { ok: false, error: "schedule.create name is required" }
  if (typeof prompt !== "string" || !prompt.trim()) return { ok: false, error: "schedule.create prompt is required" }
  if (typeof runAt !== "number" || !Number.isFinite(runAt)) return { ok: false, error: "schedule.create runAt must be a finite number" }
  if (runAt <= Date.now()) return { ok: false, error: "schedule.create runAt must be in the future" }
  let normalizedRepeat: number | undefined
  if (repeatMinutes !== undefined && repeatMinutes !== null) {
    if (typeof repeatMinutes !== "number" || !Number.isFinite(repeatMinutes)) return { ok: false, error: "schedule.create repeatMinutes must be a number" }
    if (repeatMinutes < 1) return { ok: false, error: "schedule.create repeatMinutes must be >= 1" }
    normalizedRepeat = repeatMinutes > 525_600 ? 525_600 : Math.floor(repeatMinutes)
  }
  const trimmedName = name.trim()
  const trimmedPrompt = prompt.trim()
  const finalName = trimmedName.length > MAX_NAME_CHARS ? trimmedName.slice(0, MAX_NAME_CHARS) : trimmedName
  if (finalName.length !== trimmedName.length) notices.push(`Schedule name was truncated to ${MAX_NAME_CHARS} chars`)
  const finalPrompt = trimmedPrompt.length > MAX_PROMPT_CHARS ? trimmedPrompt.slice(0, MAX_PROMPT_CHARS) : trimmedPrompt
  if (finalPrompt.length !== trimmedPrompt.length) notices.push(`Schedule prompt was truncated to ${MAX_PROMPT_CHARS} chars`)
  return {
    ok: true,
    notice: notices.length ? notices.join("; ") : undefined,
    action: {
      type: "schedule.create",
      name: finalName,
      prompt: finalPrompt,
      runAt: Math.floor(runAt),
      ...(normalizedRepeat !== undefined ? { repeatMinutes: normalizedRepeat } : {}),
    },
  }
}

export function validateAppActions(body: string): { actions: AppAction[]; errors: string[] } {
  const actions: AppAction[] = []
  const errors: string[] = []
  for (const match of body.matchAll(/<app_action>(\{[^<]+\})<\/app_action>/g)) {
    try {
      const parsed = JSON.parse(match[1])
      const result = validateAppAction(parsed)
      if (result.ok) actions.push(result.action)
      else errors.push(result.error)
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Malformed action JSON")
    }
  }
  return { actions, errors }
}
