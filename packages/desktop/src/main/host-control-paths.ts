/**
 * Portable host-control helper resolution.
 *
 * Browser, desktop, and search helpers are optional operator-owned scripts.
 * Never ship a machine-specific username path. Settings and environment
 * overrides win; otherwise discover well-known locations under the current
 * user's home directory.
 */

import { join } from "path"

export const HOST_BROWSER_ENV = "GROK_BROWSER_CONTROL"
export const HOST_DESKTOP_ENV = "GROK_DESKTOP_CONTROL"
export const HOST_SEARCH_ENV = "GROK_SEARCH_HELPER"

export type HostControlSource = "settings" | "env" | "discovered" | "missing"
export type HostHelperKind = "browser" | "desktop" | "search"

export type HostControlConfig = {
  browserScript?: string
  desktopScript?: string
  browser?: string
  desktop?: string
  disabled?: boolean
}

export type ResolvedHostHelper = {
  kind: HostHelperKind
  path: string
  exists: boolean
  source: HostControlSource
}

export type ResolvedHostControls = {
  disabled: boolean
  browser: ResolvedHostHelper
  desktop: ResolvedHostHelper
  search: ResolvedHostHelper
}

const HELPER_FILES: Record<HostHelperKind, string> = {
  browser: "browser-control.sh",
  desktop: "desktop-control.sh",
  search: "web-search-fallback.sh",
}

export function defaultHostHelperCandidates(kind: HostHelperKind, home: string): string[] {
  const name = HELPER_FILES[kind]
  return [
    join(home, ".openclaw", "workspace", "tools", name),
    join(home, ".openclaw", "tools", name),
    join(home, ".grok", "tools", name),
  ]
}

export function sanitizeHostHelperPath(value: string | undefined): string {
  const trimmed = typeof value === "string" ? value.trim() : ""
  if (!trimmed) return ""
  if (/[;&|<>`$()\n\r]/.test(trimmed)) throw new Error("Helper path contains shell metacharacters")
  return trimmed
}

function configuredPath(kind: HostHelperKind, config?: HostControlConfig): string {
  if (kind === "browser") return sanitizeHostHelperPath(config?.browserScript || config?.browser)
  if (kind === "desktop") return sanitizeHostHelperPath(config?.desktopScript || config?.desktop)
  return ""
}

function envKeyFor(kind: HostHelperKind): string {
  if (kind === "browser") return HOST_BROWSER_ENV
  if (kind === "desktop") return HOST_DESKTOP_ENV
  return HOST_SEARCH_ENV
}

export function resolveHostHelper(
  kind: HostHelperKind,
  options: {
    config?: HostControlConfig
    env?: NodeJS.Dict<string>
    home: string
    exists: (path: string) => boolean
  },
): ResolvedHostHelper {
  const fromSettings = configuredPath(kind, options.config)
  if (fromSettings) {
    return { kind, path: fromSettings, exists: options.exists(fromSettings), source: "settings" }
  }

  const fromEnv = sanitizeHostHelperPath(options.env?.[envKeyFor(kind)])
  if (fromEnv) {
    return { kind, path: fromEnv, exists: options.exists(fromEnv), source: "env" }
  }

  const candidates = defaultHostHelperCandidates(kind, options.home)
  for (const candidate of candidates) {
    if (options.exists(candidate)) {
      return { kind, path: candidate, exists: true, source: "discovered" }
    }
  }

  return { kind, path: candidates[0] || "", exists: false, source: "missing" }
}

export function resolveHostControls(options: {
  config?: HostControlConfig
  env?: NodeJS.Dict<string>
  home: string
  exists: (path: string) => boolean
}): ResolvedHostControls {
  return {
    disabled: Boolean(options.config?.disabled),
    browser: resolveHostHelper("browser", options),
    desktop: resolveHostHelper("desktop", options),
    search: resolveHostHelper("search", options),
  }
}

export function buildHostControlsPromptBlock(resolved: ResolvedHostControls): string {
  if (resolved.disabled) return ""
  const browser = resolved.browser.exists
    ? `Browser: ${resolved.browser.path} status | ${resolved.browser.path} open <https-url>`
    : ""
  const desktop = resolved.desktop.exists
    ? `macOS CuA preflight: ${resolved.desktop.path} status. After a successful preflight, use the installed Peekaboo/Lobster desktop-control workflow for native UI actions.`
    : ""
  if (!browser && !desktop) return ""
  return `\n\n## Verified host browser and computer-use controls\n${browser}\n${desktop}\nTreat only exit code 0 plus JSON ok:true and observed state as success. Empty output, daemon startup, shell open commands, or an unverified tool call are failures. If permission_required is true, report the exact missing permission and never claim the action completed. Never kill or replace the user's normal Chrome profile.`
}

export function buildSearchControlsPromptBlock(resolved: ResolvedHostControls): string {
  if (resolved.disabled || !resolved.search.exists) return ""
  return `\n\n## Verified multi-provider search helper\nSearch fallback: ${resolved.search.path} search <query>. It uses configured local provider credentials without exposing them. Prefer the bundled search-providers skill, cross-check important claims, and never print private endpoint values or API keys.`
}
