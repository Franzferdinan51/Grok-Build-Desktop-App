/**
 * Grok Build runtime discovery for the Electron target.
 *
 * Adapted from the tested candidate/probe pattern in Hermes Desktop's Electron
 * backend resolver. Unlike Hermes, every accepted candidate runs Grok Build's
 * documented CLI directly; there is no hidden secondary agent runtime.
 */

import { execFile } from "child_process"
import { existsSync } from "fs"
import { promisify } from "util"

const execute = promisify(execFile)
const PROBE_TIMEOUT_MS = 5_000

export type GrokBuildCandidate = {
  command: string
  source: "GROK_BUILD_PATH" | "PATH"
}

export type ResolvedGrokBuild =
  | { available: true; command: string; source: GrokBuildCandidate["source"]; version?: string }
  | { available: false; command: string; error: string }

export function grokBuildCandidates(environment: NodeJS.ProcessEnv = process.env): GrokBuildCandidate[] {
  const explicit = environment.GROK_BUILD_PATH?.trim()
  if (explicit) return [{ command: explicit, source: "GROK_BUILD_PATH" }]
  return [{ command: "grok", source: "PATH" }]
}

export async function probeGrokBuild(candidate: GrokBuildCandidate): Promise<ResolvedGrokBuild> {
  if (candidate.command.includes("/") && !existsSync(candidate.command)) {
    return { available: false, command: candidate.command, error: `Grok Build was not found at ${candidate.command}` }
  }

  try {
    const { stdout, stderr } = await execute(candidate.command, ["--version"], {
      timeout: PROBE_TIMEOUT_MS,
      windowsHide: true,
    })
    return {
      available: true,
      command: candidate.command,
      source: candidate.source,
      version: `${stdout}${stderr}`.trim() || undefined,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      available: false,
      command: candidate.command,
      error: candidate.source === "GROK_BUILD_PATH"
        ? `GROK_BUILD_PATH could not run Grok Build: ${message}`
        : "Install Grok Build or set GROK_BUILD_PATH.",
    }
  }
}

export async function resolveGrokBuild(environment: NodeJS.ProcessEnv = process.env): Promise<ResolvedGrokBuild> {
  const candidates = grokBuildCandidates(environment)
  for (const candidate of candidates) {
    const result = await probeGrokBuild(candidate)
    if (result.available) return result
  }
  const candidate = candidates[0]
  return { available: false, command: candidate.command, error: "Install Grok Build or set GROK_BUILD_PATH." }
}
