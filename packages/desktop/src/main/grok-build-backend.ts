/**
 * Grok Build execution backend.
 *
 * The desktop app is a client for Grok Build, not a second coding agent layered
 * on top of it. This adapter uses Grok Build's documented headless interface:
 * `grok -p <prompt> --output-format streaming-json`.
 *
 * Source: xai-org/grok-build, user-guide/14-headless-mode.md.
 */

import { execFile, spawn, type ChildProcess } from "child_process"
import { promisify } from "util"
import { write as writeLog } from "./logging"
import { resolveGrokBuild } from "./grok-build-resolver"
import { providerSecretEnvironment } from "./model-secrets"
import { getStore } from "./store"

export type GrokBuildStatus =
  | { available: true; command: string; version?: string }
  | { available: false; command: string; error: string }

export type GrokBuildModelCatalog = {
  defaultModel?: string
  models: string[]
}

const execFileAsync = promisify(execFile)

export type GrokBuildEvent =
  | { type: "text"; data: string }
  | { type: "thought"; data: string }
  | { type: "end"; sessionId?: string; usage?: unknown; num_turns?: number }
  | { type: "error"; message: string }
  | { type: string; [key: string]: unknown }

export type RunTaskInput = {
  prompt: string
  cwd: string
  model?: string
  thinking?: boolean
  autoApprove?: boolean
  resume?: string
  bestOfN?: number
  selfVerify?: boolean
  maxTurns?: number
  disableWebSearch?: boolean
  moa?: { referenceModels: string[]; aggregatorModel?: string }
}

export class GrokBuildBackend {
  private current: ChildProcess | null = null
  private moaAbort: AbortController | null = null

  isRunning(): boolean { return this.current !== null || this.moaAbort !== null }

  private command(): string {
    return getStore().get("grok.cliPath") || process.env.GROK_BUILD_PATH || "grok"
  }

  async status(): Promise<GrokBuildStatus> {
    return resolveGrokBuild({ ...process.env, GROK_BUILD_PATH: this.command() })
  }

  /**
   * Grok Build owns model configuration. `grok models` includes built-in,
   * LM Studio, and other OpenAI-compatible models configured in ~/.grok.
   * This reads that catalog; it never contacts LM Studio directly or changes
   * its loaded-model state.
   */
  async models(): Promise<GrokBuildModelCatalog> {
    const status = await this.status()
    if (!status.available) return { models: [] }
    try {
      const { stdout } = await execFileAsync(status.command, ["models"], { timeout: 10_000 })
      const models: string[] = []
      let defaultModel: string | undefined
      for (const raw of stdout.split(/\r?\n/)) {
        const defaultMatch = raw.match(/^\s*\*\s+(.+?)\s+\(default\)\s*$/)
        const regularMatch = raw.match(/^\s*-\s+(.+?)\s*$/)
        if (defaultMatch) {
          defaultModel = defaultMatch[1]
          models.push(defaultModel)
        } else if (regularMatch) {
          models.push(regularMatch[1])
        }
      }
      return { defaultModel, models: [...new Set(models)] }
    } catch (error) {
      writeLog("error", `Could not read Grok Build model catalog: ${String(error)}`)
      return { models: [] }
    }
  }

  async run(input: RunTaskInput, onEvent: (event: GrokBuildEvent) => void): Promise<void> {
    if (!input.prompt.trim()) throw new Error("A task prompt is required")
    if (this.isRunning()) throw new Error("A Grok Build task is already running")

    const command = this.command()
    let effectivePrompt = input.prompt
    let effectiveModel = input.model
    if (input.moa?.referenceModels.length) {
      this.moaAbort = new AbortController()
      const references = input.moa.referenceModels.slice(0, 10)
      onEvent({ type: "thought", data: `Mixture of Agents: consulting ${references.length} reference models in parallel…` })
      try {
        const answers = await Promise.all(references.map(async (referenceModel, index) => {
          const candidatePrompt = `Act as independent solution candidate ${index + 1} of ${references.length}. Analyze the coding task deeply and propose a concrete implementation. Do not edit files; return an implementation plan, risks, and verification steps.\n\nTask:\n${input.prompt}`
          const candidateArgs = ["-p", candidatePrompt, "--cwd", input.cwd, "--output-format", "plain", "--permission-mode", "plan", "--no-subagents", "--model", referenceModel]
          const { stdout } = await execFileAsync(command, candidateArgs, { timeout: 900_000, maxBuffer: 8 * 1024 * 1024, signal: this.moaAbort!.signal, env: { ...process.env, ...providerSecretEnvironment() } })
          onEvent({ type: "thought", data: `Reference ${index + 1} (${referenceModel}) completed.\n${stdout.trim()}` })
          return `## Reference ${index + 1} — ${referenceModel}\n${stdout.trim()}`
        }))
        effectivePrompt = `You are the acting Mixture-of-Agents aggregator. Synthesize the strongest parts of the independent reference analyses below, resolve conflicts, then execute the original coding task in the workspace. Verify the final implementation.\n\n## Original task\n${input.prompt}\n\n${answers.join("\n\n")}`
        effectiveModel = input.moa.aggregatorModel || input.model
      } finally {
        this.moaAbort = null
      }
    }

    const args = ["-p", effectivePrompt, "--cwd", input.cwd, "--output-format", "streaming-json"]
    if (effectiveModel) args.push("--model", effectiveModel)
    if (input.thinking) args.push("--reasoning-effort", "high")
    if (input.autoApprove) args.push("--yolo")
    if (input.resume) args.push("--resume", input.resume)
    if (!input.moa && input.bestOfN && input.bestOfN >= 2) args.push("--best-of-n", String(Math.min(10, Math.floor(input.bestOfN))))
    if (input.selfVerify) args.push("--check")
    if (input.maxTurns && input.maxTurns > 0) args.push("--max-turns", String(Math.min(100, Math.floor(input.maxTurns))))
    if (input.disableWebSearch) args.push("--disable-web-search")

    writeLog("info", `Starting Grok Build task in ${input.cwd}`)
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, ...providerSecretEnvironment() } })
    this.current = child
    let buffer = ""
    let stderr = ""

    const emitLines = (chunk: Buffer) => {
      buffer += chunk.toString()
      const lines = buffer.split("\n")
      buffer = lines.pop() ?? ""
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const parsed = JSON.parse(line) as GrokBuildEvent & { sessionId?: string; session_id?: string }
          // Keep upstream JSON field spelling intact while exposing a stable
          // desktop session id for persistent run history.
          if (!parsed.sessionId && typeof parsed.session_id === "string") parsed.sessionId = parsed.session_id
          onEvent(parsed)
        }
        catch { onEvent({ type: "text", data: line + "\n" }) }
      }
    }

    child.stdout?.on("data", emitLines)
    child.stderr?.on("data", (chunk: Buffer) => {
      // Preserve the useful tail without allowing a noisy child process to
      // consume unbounded memory during a long-running task.
      stderr = (stderr + chunk.toString()).slice(-1_000_000)
    })

    await new Promise<void>((resolve, reject) => {
      child.on("error", (error) => reject(error))
      child.on("exit", (code) => {
        this.current = null
        if (buffer.trim()) emitLines(Buffer.from("\n"))
        if (code === 0) resolve()
        else {
          const message = stderr.trim() || `Grok Build exited ${code}`
          onEvent({ type: "error", message })
          reject(new Error(message))
        }
      })
    })
  }

  cancel(): void {
    this.moaAbort?.abort()
    this.moaAbort = null
    if (!this.current) return
    this.current.kill("SIGTERM")
    this.current = null
  }
}
