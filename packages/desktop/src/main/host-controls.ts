import { execFile } from "child_process"
import { promisify } from "util"
import { existsSync } from "fs"
import { getStore } from "./store"

const execFileAsync = promisify(execFile)

// Host browser and computer-use control helpers. The defaults match the
// openclaw/peekaboo scripts shipped in this developer's workspace; users on
// other machines can override them via the host settings without editing code.
const DEFAULT_BROWSER_CONTROL = "/Users/duckets/.openclaw/workspace/tools/browser-control.sh"
const DEFAULT_DESKTOP_CONTROL = "/Users/duckets/.openclaw/workspace/tools/desktop-control.sh"

function hostConfig(): { browser?: string; desktop?: string; disabled?: boolean } {
  return getStore().get("host") || {}
}

export type HostControlResult = {
  ok: boolean
  backend: string
  action: string
  observed?: unknown
  error?: string | null
  permission_required?: boolean
  missing_permissions?: unknown[]
}

async function invoke(script: string, args: string[], timeout: number): Promise<HostControlResult> {
  if (!script) return { ok: false, backend: "unavailable", action: args[0] || "status", error: "Host control helper path is not configured. Set it in Settings → Agent → Host control scripts." }
  if (!existsSync(script)) return { ok: false, backend: "unavailable", action: args[0] || "status", error: `Control helper is missing: ${script}` }
  try {
    const { stdout } = await execFileAsync(script, args, { timeout, maxBuffer: 2 * 1024 * 1024 })
    const result = JSON.parse(stdout.trim()) as HostControlResult
    if (result.ok !== true) throw new Error(result.error || "Control helper did not verify success")
    return result
  } catch (error) {
    const candidate = error as Error & { stdout?: string; stderr?: string }
    try {
      const parsed = JSON.parse(candidate.stdout?.trim() || "") as HostControlResult
      return { ...parsed, ok: false }
    } catch {
      return { ok: false, backend: "control-helper", action: args[0] || "status", error: candidate.stderr?.trim() || candidate.message }
    }
  }
}

export const hostBrowserStatus = () => {
  const config = hostConfig()
  if (config.disabled) return Promise.resolve({ ok: false, backend: "disabled", action: "status", error: "Host browser control is disabled in Settings." })
  return invoke(config.browser || DEFAULT_BROWSER_CONTROL, ["status"], 20_000)
}
export const hostBrowserOpen = (url: string) => {
  const config = hostConfig()
  if (config.disabled) return Promise.resolve({ ok: false, backend: "disabled", action: "open", error: "Host browser control is disabled in Settings." })
  const target = new URL(url)
  if (target.protocol !== "http:" && target.protocol !== "https:") throw new Error("Only HTTP(S) URLs can be opened")
  return invoke(config.browser || DEFAULT_BROWSER_CONTROL, ["open", target.toString()], 30_000)
}
export const hostDesktopStatus = () => {
  const config = hostConfig()
  if (config.disabled) return Promise.resolve({ ok: false, backend: "disabled", action: "status", error: "Host computer-use control is disabled in Settings." })
  return invoke(config.desktop || DEFAULT_DESKTOP_CONTROL, ["status"], 20_000)
}
