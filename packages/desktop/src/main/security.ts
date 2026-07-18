/**
 * Security helpers for the desktop main process.
 *
 * `safeOpenExternal` is the single funnel for `shell.openExternal` so every
 * call site enforces the same protocol whitelist (http/https only). The IPC
 * boundary previously checked this on its own, but `menu.ts` and
 * `telegram-text.ts` both called `shell.openExternal` directly; a future
 * menu entry or renderer-supplied URL would have bypassed the validation
 * surface. Centralising here keeps the floor uniform and tested.
 *
 * URL classification lives in `shared/url-safety.ts` so the renderer can
 * import the same helper without pulling in `electron`.
 */

import { shell } from "electron"
import { isSafeExternalUrl } from "../shared/url-safety.ts"

export { isSafeExternalUrl }

export class UnsafeExternalUrlError extends Error {
  readonly url: string
  constructor(message: string, url: string) {
    super(message)
    this.name = "UnsafeExternalUrlError"
    this.url = url
  }
}

/**
 * Open `url` with `shell.openExternal` after validating its protocol.
 * Returns `true` when the URL passed validation AND the OS accepted
 * the open request. Throws `UnsafeExternalUrlError` on a non-http(s) URL
 * so callers can surface the rejection rather than silently dropping it.
 *
 * Electron 32+ changed `shell.openExternal` to return `Promise<void>`,
 * so the boolean it used to return is no longer available. We resolve
 * `true` only when the call settles without throwing.
 */
export async function safeOpenExternal(url: string): Promise<boolean> {
  if (!isSafeExternalUrl(url)) throw new UnsafeExternalUrlError(`Refusing to open non-http(s) URL`, url)
  await shell.openExternal(url.trim())
  return true
}

/**
 * Same as `safeOpenExternal` but returns a structured `{ ok, error? }`
 * result for callers (e.g. menu actions) that cannot propagate exceptions
 * cleanly. Use `safeOpenExternal` when an exception is the right outcome.
 */
export async function safeOpenExternalResult(url: string): Promise<{ ok: boolean; error?: string }> {
  if (!isSafeExternalUrl(url)) return { ok: false, error: `Refusing to open non-http(s) URL` }
  try {
    await shell.openExternal(url.trim())
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}
