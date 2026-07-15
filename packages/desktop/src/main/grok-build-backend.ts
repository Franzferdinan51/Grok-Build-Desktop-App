/**
 * Grok Build execution backend.
 *
 * The desktop app is a client for Grok Build, not a second coding agent layered
 * on top of it. This adapter uses Grok Build's documented headless interface:
 * `grok -p <prompt> --output-format streaming-json`.
 *
 * Source: xai-org/grok-build, user-guide/14-headless-mode.md.
 */

import { spawn, type ChildProcess } from "child_process"
import { existsSync } from "fs"
import { delimiter, dirname } from "path"
import { write as writeLog } from "./logging"

export type GrokBuildStatus =
  | { available: true; command: string; version?: string }
  | { available: false; command: string; error: string }

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
    const command = this.command()
    if (command.includes("/") && !existsSync(command)) {
      return { available: false, command, error: `Grok Build was not found at ${command}` }
    }

    return new Promise((resolve) => {
      const child = spawn(command, ["--version"], { stdio: ["ignore", "pipe", "pipe"] })
      let output = ""
      child.stdout.on("data", (chunk: Buffer) => { output += chunk.toString() })
      child.stderr.on("data", (chunk: Buffer) => { output += chunk.toString() })
      child.on("error", (error: NodeJS.ErrnoException) => resolve({
        available: false,
        command,
        error: error.code === "ENOENT" ? "Install Grok Build or set GROK_BUILD_PATH." : error.message,
      }))
      child.on("exit", (code) => {
        if (code === 0) resolve({ available: true, command, version: output.trim() || undefined })
        else resolve({ available: false, command, error: output.trim() || `grok --version exited ${code}` })
      })
    })
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
        try { onEvent(JSON.parse(line) as GrokBuildEvent) }
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
