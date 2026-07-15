/**
 * main/sidecar.ts — Grok CLI Sidecar Manager
 *
 * Downloads the Grok CLI on first run and spawns it as a child process.
 * Communicates via JSON-RPC over stdio (mirroring how xai-grok-shell
 * exposes `run_stdio_agent` in headless mode).
 *
 * Protocol reference:
 *   https://github.com/xai-org/grok-build (grok CLI stdio mode)
 *   https://github.com/sst/opencode/blob/dev/packages/desktop/src/main/sidecar.ts (opencode pattern)
 *
 * The Grok CLI binary is downloaded from:
 *   - Primary:  https://x.ai/cli/install.sh
 *   - Fork:     https://github.com/Franzferdinan51/grok-build
 */

import { spawn, ChildProcessWithoutNullStreams } from "child_process"
import { createWriteStream, existsSync, mkdirSync, chmodSync, unlinkSync } from "fs"
import { join, dirname } from "path"
import { app, getPath } from "electron"
import { write as writeLog } from "./logging"
import { pipeline } from "stream/promises"
import { Agent } from "http"
import type { Readable } from "stream"

// ── Types ────────────────────────────────────────────────────────────────────

export type GrokSidecarStatus =
  | { running: true; pid: number; version?: string }
  | { running: false; error?: string }

export type JsonRpcRequest = {
  jsonrpc: "2.0"
  id?: number | string
  method: string
  params?: unknown
}

export type JsonRpcResponse = {
  jsonrpc: "2.0"
  id?: number | string
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

type SidecarOptions = {
  downloadIfMissing?: boolean
  forkUrl?: string
}

// ── JSON-RPC line splitter ────────────────────────────────────────────────────

/**
 * Splits a stream into JSON-RPC messages on newlines.
 * Each line is a complete JSON-RPC request or response object.
 */
class LineSplitter {
  private buffer = ""

  feed(chunk: string): (JsonRpcRequest | JsonRpcResponse)[] {
    this.buffer += chunk
    const lines = this.buffer.split("\n")
    // Keep the last incomplete line in the buffer
    this.buffer = lines.pop() ?? ""
    return lines
      .filter((l) => l.trim().length > 0)
      .map((l) => JSON.parse(l) as JsonRpcRequest | JsonRpcResponse)
  }
}

// ── Sidecar Manager ───────────────────────────────────────────────────────────

export class GrokSidecarManager {
  private proc: ChildProcessWithoutNullStreams | null = null
  private splitter = new LineSplitter()
  private pending = new Map<number | string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
  private eventListeners = new Map<string, ((data: unknown) => void)[]>()
  private requestId = 0
  private _status: GrokSidecarStatus = { running: false }
  private downloadIfMissing: boolean
  private forkUrl: string

  constructor(options: SidecarOptions = {}) {
    this.downloadIfMissing = options.downloadIfMissing ?? false
    this.forkUrl = options.forkUrl ?? "https://github.com/xai-org/grok-build"
  }

  get status(): GrokSidecarStatus {
    return this._status
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    const binaryPath = await this.resolveBinaryPath()

    if (!existsSync(binaryPath)) {
      if (this.downloadIfMissing) {
        writeLog("info", "Grok binary not found — downloading...")
        await this.downloadBinary(binaryPath)
      } else {
        throw new Error(
          `Grok binary not found at ${binaryPath}. ` +
          `Set downloadIfMissing: true or install manually: curl -fsSL https://x.ai/cli/install.sh | bash`
        )
      }
    }

    writeLog("info", `Spawning grok from ${binaryPath}`)
    this.proc = spawn(binaryPath, ["--headless", "--stdio"], {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        // Grok CLI reads these for auth token
        XAI_API_KEY: process.env.XAI_API_KEY ?? "",
      },
    })

    this.proc.stdout.on("data", (chunk: Buffer) => {
      const messages = this.splitter.feed(chunk.toString())
      for (const msg of messages) {
        this.handleMessage(msg)
      }
    })

    this.proc.stderr.on("data", (chunk: Buffer) => {
      // Stderr may contain debug/tracing output — log at debug level
      const lines = chunk.toString().split("\n").filter(Boolean)
      if (lines.length > 0) {
        writeLog("debug", `grok stderr: ${lines[0]}`)
      }
    })

    this.proc.on("exit", (code, signal) => {
      writeLog("info", `Grok sidecar exited: code=${code} signal=${signal}`)
      this._status = { running: false, error: `exited with code ${code}` }
      this.rejectAll(new Error(`Grok process exited: ${code}`))
    })

    this.proc.on("error", (err) => {
      writeLog("error", `Grok sidecar error: ${err.message}`)
      this._status = { running: false, error: err.message }
    })

    // Wait briefly for the process to confirm it's up
    await this.waitForReady()

    this._status = { running: true, pid: this.proc.pid! }
    writeLog("info", `Grok sidecar running — pid=${this.proc.pid}`)
  }

  async stop(): Promise<void> {
    if (!this.proc) return
    writeLog("info", "Stopping Grok sidecar")

    // Try graceful shutdown first
    try {
      this.send("shutdown", {}).catch(() => {})
      this.proc.stdin.end()
    } catch {
      // Ignore
    }

    // Force kill after 3s
    const pid = this.proc.pid
    this.proc.kill("SIGTERM")
    await new Promise<void>((resolve) => setTimeout(resolve, 3000))
    if (this.proc && !this.proc.killed) {
      this.proc.kill("SIGKILL")
    }
    this.proc = null
    this._status = { running: false }
    writeLog("info", "Grok sidecar stopped")
  }

  // ── JSON-RPC over stdio ────────────────────────────────────────────────────

  /**
   * Send a JSON-RPC request and wait for a response.
   * Grok CLI's headless stdio mode speaks JSON-RPC 2.0.
   */
  send(method: string, params: unknown): Promise<unknown> {
    if (!this.proc || !this.proc.stdin.writable) {
      return Promise.reject(new Error("sidecar not running"))
    }

    const id = ++this.requestId
    const req: JsonRpcRequest = { jsonrpc: "2.0", id, method, params }

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      try {
        this.proc!.stdin.write(JSON.stringify(req) + "\n")
      } catch (err) {
        this.pending.delete(id)
        reject(err)
      }

      // Timeout after 60s
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id)
          reject(new Error(`Request ${method} timed out after 60s`))
        }
      }, 60_000)
    })
  }

  /**
   * Register a listener for server-sent events (notifications from grok).
   * These are JSON-RPC responses with no `id` field.
   */
  onEvent(channel: string, handler: (data: unknown) => void): void {
    const existing = this.eventListeners.get(channel) ?? []
    this.eventListeners.set(channel, [...existing, handler])
  }

  offEvent(channel: string, handler: (data: unknown) => void): void {
    const existing = this.eventListeners.get(channel) ?? []
    this.eventListeners.set(
      channel,
      existing.filter((h) => h !== handler)
    )
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private handleMessage(msg: JsonRpcRequest | JsonRpcResponse): void {
    if ("id" in msg && msg.id !== undefined) {
      // Response — resolve the matching pending promise
      const pending = this.pending.get(msg.id)
      if (pending) {
        this.pending.delete(msg.id)
        if ("error" in msg && msg.error) {
          pending.reject(new Error(msg.error.message))
        } else {
          pending.resolve(msg.result)
        }
      }
    } else if (!("id" in msg) || msg.id === undefined) {
      // Notification — route to event listeners
      // Extract channel from method name (e.g. "agent/message" → "message")
      const channel = String(("method" in msg ? msg.method : "")).split("/").pop() ?? "unknown"
      const handlers = this.eventListeners.get(channel) ?? []
      for (const handler of handlers) {
        try {
          handler("params" in msg ? msg.params : msg)
        } catch (err) {
          writeLog("error", `Event handler error: ${(err as Error).message}`)
        }
      }
    }
  }

  private async waitForReady(): Promise<void> {
    // Send an ping/request to verify the process is alive and speaking JSON-RPC
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Grok sidecar did not respond within 10s")), 10_000)

      // Try to get version/capabilities
      try {
        this.proc!.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "initialize", params: {}, id: -1 }) + "\n")
      } catch {
        clearTimeout(timeout)
        reject(new Error("Failed to write to grok stdin"))
        return
      }

      // Once a message is received, we're ready
      const handler = () => {
        clearTimeout(timeout)
        this.proc!.stdout.off("data", handler)
        resolve()
      }
      this.proc!.stdout.on("data", handler)
    })
  }

  private async resolveBinaryPath(): Promise<string> {
    // 1. Check environment override
    if (process.env.GROK_CLI_PATH) return process.env.GROK_CLI_PATH

    // 2. Check app userData dir
    const userDataDir = app.isPackaged
      ? app.getPath("userData")
      : join(app.getAppPath(), "../../.grok-cli")

    mkdirSync(userDataDir, { recursive: true })
    const platform = process.platform === "darwin" ? "macos" : process.platform === "win32" ? "windows" : "linux"
    const arch = process.arch === "x64" ? "x86_64" : process.arch === "arm64" ? "aarch64" : process.arch
    const binaryName = platform === "windows" ? "grok.exe" : "grok"

    return join(userDataDir, "bin", `${platform}-${arch}`, binaryName)
  }

  private async downloadBinary(destPath: string): Promise<void> {
    mkdirSync(dirname(destPath), { recursive: true })

    // Use the official install script
    const scriptUrl = "https://x.ai/cli/install.sh"
    writeLog("info", `Downloading Grok CLI from ${scriptUrl}`)

    try {
      // Download the install script and pipe to bash
      const { execFileSync } = await import("child_process")
      execFileSync("bash", ["-c", `curl -fsSL ${scriptUrl} | GROK_INSTALL_PATH=${dirname(destPath)} bash`], {
        stdio: "inherit",
        timeout: 120_000,
      })
    } catch (err) {
      throw new Error(
        `Failed to download Grok CLI. ` +
        `Manually install: curl -fsSL ${scriptUrl} | bash, ` +
        `or set GROK_CLI_PATH environment variable.`
      )
    }

    if (!existsSync(destPath)) {
      throw new Error(`Download completed but binary not found at ${destPath}`)
    }
    chmodSync(destPath, 0o755)
    writeLog("info", `Grok CLI installed at ${destPath}`)
  }

  private rejectAll(err: Error): void {
    for (const { reject } of this.pending.values()) {
      reject(err)
    }
    this.pending.clear()
  }
}
