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
}

export class GrokBuildBackend {
  private current: ChildProcess | null = null

  private command(): string {
    return process.env.GROK_BUILD_PATH || "grok"
  }

  async status(): Promise<GrokBuildStatus> {
    return resolveGrokBuild()
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
    if (this.current) throw new Error("A Grok Build task is already running")

    const args = ["-p", input.prompt, "--cwd", input.cwd, "--output-format", "streaming-json"]
    if (input.model) args.push("--model", input.model)
    if (input.thinking) args.push("--reasoning-effort", "high")
    if (input.autoApprove) args.push("--yolo")
    if (input.resume) args.push("--resume", input.resume)

    const command = this.command()
    writeLog("info", `Starting Grok Build task in ${input.cwd}`)
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] })
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
    child.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString() })

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
    if (!this.current) return
    this.current.kill("SIGTERM")
    this.current = null
  }
}
