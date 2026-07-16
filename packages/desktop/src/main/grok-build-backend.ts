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
import { configureCodexOAuthModels, providerSecretEnvironment } from "./model-secrets"
import { getStore } from "./store"
import { CodexOAuthBridge } from "./codex-oauth-bridge"

export type GrokBuildStatus =
  | { available: true; command: string; version?: string }
  | { available: false; command: string; error: string }

export type GrokBuildModelCatalog = {
  defaultModel?: string
  models: string[]
}
export type GrokBuildUpdateStatus = { currentVersion: string; latestVersion: string; updateAvailable: boolean; channel: "stable" | "alpha"; error?: string | null }

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
  subagents?: boolean
  moa?: { referenceModels: string[]; aggregatorModel?: string }
}

export class GrokBuildBackend {
  private current: ChildProcess | null = null
  private moaAbort: AbortController | null = null
  private readonly codexBridge = new CodexOAuthBridge()

  isRunning(): boolean { return this.current !== null || this.moaAbort !== null }

  async status(): Promise<GrokBuildStatus> {
    const configured = getStore().get("grok.cliPath") || process.env.GROK_BUILD_PATH
    return resolveGrokBuild(configured ? { ...process.env, GROK_BUILD_PATH: configured } : process.env)
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
      try { await this.syncCodexOAuthModels() }
      catch (error) { writeLog("error", `Could not sync OpenAI Codex OAuth models: ${String(error)}`) }
      const { stdout } = await execFileAsync(status.command, ["models"], { timeout: 10_000, env: this.environment() })
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

  private environment(): NodeJS.ProcessEnv {
    return { ...process.env, ...providerSecretEnvironment(this.codexBridge.environment()) }
  }

  private async syncCodexOAuthModels(): Promise<void> {
    if (!(await this.codexBridge.available())) return
    const models = await this.codexBridge.models()
    configureCodexOAuthModels(this.codexBridge.baseUrl(), models)
  }

  async startOAuth(provider: "xai" | "openai" | "minimax"): Promise<{ ok: boolean; message: string }> {
    const status = await this.status()
    if (provider === "xai" && !status.available) throw new Error(status.error)
    const executable = provider === "xai" ? status.command : provider === "minimax" ? "mmx" : "hermes"
    const oauthArgs = provider === "xai" ? ["--oauth"] : provider === "minimax" ? ["auth", "login", "--recommend", "--region=global"] : ["auth", "add", "openai-codex", "--type", "oauth"]
    if (provider !== "xai") {
      try { await execFileAsync(executable, ["auth", "--help"], { timeout: 10_000 }) }
      catch { throw new Error(provider === "minimax" ? "MiniMax’s official mmx CLI is required for this OAuth flow." : "Hermes Agent is required for this OAuth flow. Install Hermes, then try again.") }
    }
    if (process.platform === "darwin") {
      const command = [executable, ...oauthArgs].map((part) => JSON.stringify(part)).join(" ")
      await execFileAsync("osascript", ["-e", `tell application "Terminal" to do script ${JSON.stringify(command)}`], { timeout: 10_000 })
    } else if (process.platform === "win32") {
      const child = spawn("cmd.exe", ["/c", "start", "", executable, ...oauthArgs], { detached: true, stdio: "ignore" }); child.unref()
    } else {
      const child = spawn(executable, oauthArgs, { detached: true, stdio: "ignore" }); child.unref()
    }
    const label = provider === "xai" ? "xAI" : provider === "openai" ? "OpenAI Codex" : "MiniMax"
    return { ok: true, message: `${label} OAuth opened in Terminal. Finish browser sign-in, then return to the app.` }
  }

  async checkUpdate(): Promise<GrokBuildUpdateStatus> {
    const status = await this.status()
    if (!status.available) throw new Error(status.error)
    const { stdout } = await execFileAsync(status.command, ["update", "--check", "--json"], { timeout: 30_000, maxBuffer: 1_000_000 })
    return JSON.parse(stdout) as GrokBuildUpdateStatus
  }

  async installUpdate(channel: "stable" | "alpha" = "stable"): Promise<GrokBuildUpdateStatus> {
    if (this.isRunning()) throw new Error("Finish or cancel the current Grok Build task before updating")
    const status = await this.status()
    if (!status.available) throw new Error(status.error)
    await execFileAsync(status.command, ["update", channel === "alpha" ? "--alpha" : "--stable"], { timeout: 10 * 60_000, maxBuffer: 5_000_000 })
    return this.checkUpdate()
  }

  async run(input: RunTaskInput, onEvent: (event: GrokBuildEvent) => void): Promise<void> {
    if (!input.prompt.trim()) throw new Error("A task prompt is required")
    if (this.isRunning()) throw new Error("A Grok Build task is already running")

    const status = await this.status()
    if (!status.available) throw new Error(status.error)
    if (input.model?.startsWith("codex-")) await this.syncCodexOAuthModels()
    const command = status.command
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
          const { stdout } = await execFileAsync(command, candidateArgs, { timeout: 900_000, maxBuffer: 8 * 1024 * 1024, signal: this.moaAbort!.signal, env: this.environment() })
          onEvent({ type: "thought", data: `Reference ${index + 1} (${referenceModel}) completed.\n${stdout.trim()}` })
          return `## Reference ${index + 1} — ${referenceModel}\n${stdout.trim()}`
        }))
        effectivePrompt = `You are the acting Mixture-of-Agents aggregator. Synthesize the strongest parts of the independent reference analyses below, resolve conflicts, then execute the original coding task in the workspace. Verify the final implementation.\n\n## Original task\n${input.prompt}\n\n${answers.join("\n\n")}`
        effectiveModel = input.moa.aggregatorModel || input.model
      } finally {
        this.moaAbort = null
      }
    }

    const baseArgs = ["-p", effectivePrompt, "--cwd", input.cwd, "--output-format", "streaming-json"]
    const args = [...baseArgs]
    if (effectiveModel) args.push("--model", effectiveModel)
    if (input.thinking) args.push("--reasoning-effort", "high")
    if (input.autoApprove) args.push("--yolo")
    if (input.resume) args.push("--resume", input.resume)
    if (!input.moa && input.bestOfN && input.bestOfN >= 2) args.push("--best-of-n", String(Math.min(10, Math.floor(input.bestOfN))))
    if (input.selfVerify) args.push("--check")
    if (input.maxTurns && input.maxTurns > 0) args.push("--max-turns", String(Math.min(100, Math.floor(input.maxTurns))))
    if (input.disableWebSearch) args.push("--disable-web-search")
    if (input.subagents === false) args.push("--no-subagents")

    const runChild = (childArgs: string[]) => new Promise<string>((resolve, reject) => {
      writeLog("info", `Starting Grok Build task in ${input.cwd}`)
      const child = spawn(command, childArgs, { stdio: ["ignore", "pipe", "pipe"], env: this.environment() })
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
            if (!parsed.sessionId && typeof parsed.session_id === "string") parsed.sessionId = parsed.session_id
            onEvent(parsed)
          } catch { onEvent({ type: "text", data: line + "\n" }) }
        }
      }
      child.stdout?.on("data", emitLines)
      child.stderr?.on("data", (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-1_000_000) })
      child.on("error", reject)
      child.on("exit", (code) => {
        this.current = null
        if (buffer.trim()) emitLines(Buffer.from("\n"))
        if (code === 0) resolve(stderr)
        else reject(new Error(stderr.trim() || `Grok Build exited ${code}`))
      })
    })

    try {
      await runChild(args)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const incompatibleProvider = Boolean(effectiveModel) && /serialization error: missing field [`']?created/i.test(message)
      if (!incompatibleProvider) {
        onEvent({ type: "error", message })
        throw error
      }
      writeLog("error", `Provider ${effectiveModel} omitted the OpenAI created field; retrying with the Grok default model`)
      onEvent({ type: "thought", data: `The selected provider returned an incompatible streaming response (missing “created”). Retrying this run with the Grok Build default model.\n` })
      try {
        await runChild(baseArgs.concat(args.slice(baseArgs.length).filter((value, index, tail) => tail[index - 1] !== "--model" && value !== "--model")))
      } catch (fallbackError) {
        const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
        onEvent({ type: "error", message: fallbackMessage })
        throw fallbackError
      }
    }
  }

  cancel(): void {
    this.moaAbort?.abort()
    this.moaAbort = null
    if (!this.current) return
    this.current.kill("SIGTERM")
    this.current = null
  }

  async shutdown(): Promise<void> {
    this.cancel()
    await this.codexBridge.stop()
  }
}
