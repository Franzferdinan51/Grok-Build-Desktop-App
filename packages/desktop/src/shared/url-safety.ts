/**
 * url-safety.ts — Pure URL-safety helpers.
 *
 * Lives in `shared/` because both the Electron main process AND the
 * Solid renderer need the same protocol whitelist. Pulling these helpers
 * into `main/security.ts` would force the renderer to bundle `electron`,
 * which is blocked in sandboxed renderer builds. The pure functions here
 * can be tree-shaken on either side.
 */

/** Decide whether `url` is safe to hand to `shell.openExternal`. */
export function isSafeExternalUrl(url: unknown): url is string {
  if (typeof url !== "string") return false
  const trimmed = url.trim()
  if (!trimmed) return false
  try {
    const parsed = new URL(trimmed)
    return parsed.protocol === "http:" || parsed.protocol === "https:"
  } catch {
    return false
  }
}
