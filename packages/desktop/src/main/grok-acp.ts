import { spawn, type ChildProcess } from "child_process"

export type GrokAcpPermissionMode = "default" | "acceptEdits" | "auto" | "dontAsk" | "bypassPermissions" | "plan"

export type GrokAcpPermissionOption = { optionId?: string; name?: string; kind?: string; description?: string }
export type GrokAcpPermissionRequest = { options: GrokAcpPermissionOption[]; toolCall?: unknown; title?: string }
export type GrokAcpPermissionResponse = { outcome: { outcome: "selected"; optionId: string } | { outcome: "cancelled" } }
export type GrokAcpSubagentEvent = { id: string; status: "running" | "completed" | "failed" | "cancelled"; label?: string; durationMs?: number; toolCalls?: number; turns?: number }

export type GrokAcpCallbacks = {
  onText?: (text: string) => void
  onThought?: (text: string) => void
  onTool?: (title: string) => void
  onSession?: (sessionId: string) => void
  onSubagent?: (event: GrokAcpSubagentEvent) => void
  onPermissionRequest?: (request: GrokAcpPermissionRequest) => Promise<GrokAcpPermissionResponse>
}

export type GrokAcpResult = { text: string; sessionId: string; stopReason: string | null }

type PendingRequest = { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }

const object = (value: unknown): Record<string, any> => value && typeof value === "object" ? value as Record<string, any> : {}
const stringValue = (...values: unknown[]) => values.find((value): value is string => typeof value === "string" && Boolean(value.trim()))?.trim()
const numberValue = (...values: unknown[]) => values.find((value): value is number => typeof value === "number" && Number.isFinite(value))

export function subagentEventFromMessage(message: Record<string, any>): GrokAcpSubagentEvent | null {
  const params = object(message.params)
  const update = object(params.update || object(params.params).update)
  const sessionUpdate = stringValue(update.sessionUpdate, params.sessionUpdate)?.toLowerCase()
  const lifecycle = stringValue(message.method)?.replace(/_/g, ".").toLowerCase()
  const started = sessionUpdate === "subagent_spawned" || lifecycle === "subagent.started" || lifecycle === "subagent.spawned"
  const finished = sessionUpdate === "subagent_finished" || lifecycle === "subagent.completed" || lifecycle === "subagent.finished"
  const rawInput = object(update.rawInput || update.raw_input)
  const rawOutput = object(update.rawOutput || update.raw_output)
  const toolName = stringValue(update.toolName, update.tool_name, rawInput.toolName, rawInput.tool_name)?.toLowerCase()
  const toolStart = sessionUpdate === "tool_call" && (toolName === "spawn_subagent" || toolName === "task")
  const toolFinish = sessionUpdate === "tool_call_update" && (stringValue(rawOutput.type, rawOutput.kind)?.toLowerCase().includes("subagent") || Boolean(rawOutput.subagent_id || rawOutput.subagentId))
  if (!started && !finished && !toolStart && !toolFinish) return null
  const id = stringValue(update.subagent_id, update.subagentId, update.child_session_id, update.childSessionId, update.toolCallId, update.tool_call_id, rawOutput.subagent_id, rawOutput.subagentId)
  if (!id) return null
  const status = started || toolStart ? "running" : (stringValue(update.status, rawOutput.status)?.toLowerCase().includes("fail") ? "failed" : stringValue(update.status, rawOutput.status)?.toLowerCase().includes("cancel") ? "cancelled" : "completed")
  return {
    id,
    status,
    label: stringValue(update.description, update.title, rawInput.description, rawInput.prompt),
    durationMs: numberValue(update.duration_ms, update.durationMs, rawOutput.duration_ms, rawOutput.durationMs),
    toolCalls: numberValue(update.tool_calls, update.toolCalls, rawOutput.tool_calls, rawOutput.toolCalls),
    turns: numberValue(update.turns, rawOutput.turns),
  }
}

const TIMEOUTS = { initialize: 20_000, authenticate: 20_000, session: 30_000, prompt: 120_000 }

/** ACP permission responses are fail-closed unless the user selected bypass mode. */
export function permissionResponse(mode: GrokAcpPermissionMode, options: Array<{ optionId?: string; kind?: string }>): GrokAcpPermissionResponse {
  const allowed = mode === "bypassPermissions" ? options.find((option) => option.optionId && String(option.kind || "").startsWith("allow")) : undefined
  return allowed?.optionId
    ? { outcome: { outcome: "selected", optionId: allowed.optionId } }
    : { outcome: { outcome: "cancelled" } }
}

/** Run one authenticated Grok Build turn over the official `grok agent stdio` ACP surface. */
export function runGrokAcp(
  prompt: string,
  options: { cli: string; cwd: string; model?: string; permissionMode?: GrokAcpPermissionMode; signal?: AbortSignal },
  callbacks: GrokAcpCallbacks = {},
): Promise<GrokAcpResult> {
  const mode = options.permissionMode || "default"
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) { reject(new Error("Grok ACP task aborted")); return }
    let child: ChildProcess
    try {
      const args = ["--permission-mode", mode]
      if (options.model?.trim()) args.push("--model", options.model.trim())
      args.push("agent", "stdio")
      child = spawn(options.cli, args, {
        cwd: options.cwd,
        env: { ...process.env, XAI_API_KEY: undefined } as NodeJS.ProcessEnv,
        shell: process.platform === "win32" && /\.(?:cmd|bat)$/i.test(options.cli),
        stdio: ["pipe", "pipe", "pipe"],
      })
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)))
      return
    }

    let settled = false
    let nextId = 1
    let inputBuffer = ""
    let stderr = ""
    let output = ""
    let sessionId = ""
    let promptSent = false
    const pending = new Map<number, PendingRequest>()

    const terminate = () => { try { child.kill("SIGTERM") } catch { /* process already closed */ } }
    const fail = (error: Error) => {
      if (settled) return
      settled = true
      for (const request of pending.values()) { clearTimeout(request.timer); request.reject(error) }
      pending.clear()
      terminate()
      reject(error)
    }
    const finish = (stopReason: string | null) => {
      if (settled) return
      settled = true
      for (const request of pending.values()) clearTimeout(request.timer)
      pending.clear()
      terminate()
      resolve({ text: output, sessionId, stopReason })
    }
    const send = (message: unknown) => { if (!settled) child.stdin?.write(`${JSON.stringify(message)}\n`) }
    const request = (method: string, params: unknown, timeout: number): Promise<unknown> => new Promise((resolveRequest, rejectRequest) => {
      const id = nextId++
      const timer = setTimeout(() => { pending.delete(id); rejectRequest(new Error(`${method} timed out`)) }, timeout)
      timer.unref?.()
      pending.set(id, { resolve: resolveRequest, reject: rejectRequest, timer })
      send({ jsonrpc: "2.0", id, method, params })
    })
    const onAbort = () => fail(new Error("Grok ACP task aborted"))
    options.signal?.addEventListener("abort", onAbort, { once: true })

    child.stdout?.on("data", (chunk: Buffer) => {
      inputBuffer += chunk.toString()
      let newline = -1
      while ((newline = inputBuffer.indexOf("\n")) >= 0) {
        const line = inputBuffer.slice(0, newline).trim()
        inputBuffer = inputBuffer.slice(newline + 1)
        if (!line) continue
        let message: Record<string, any>
        try { message = JSON.parse(line) as Record<string, any> } catch { continue }
        if (message.id !== undefined && (message.result !== undefined || message.error !== undefined)) {
          const requestState = pending.get(Number(message.id))
          if (!requestState) continue
          pending.delete(Number(message.id)); clearTimeout(requestState.timer)
          if (message.error) requestState.reject(new Error(String(message.error.message || JSON.stringify(message.error))))
          else requestState.resolve(message.result || {})
          continue
        }
        if (message.id !== undefined && message.method === "session/request_permission") {
          const choices = (Array.isArray(message.params?.options) ? message.params.options : []) as GrokAcpPermissionOption[]
          const request = { options: choices, toolCall: message.params?.toolCall, title: typeof message.params?.title === "string" ? message.params.title : undefined }
          void (callbacks.onPermissionRequest
            ? callbacks.onPermissionRequest(request)
            : Promise.resolve(permissionResponse(mode, choices)))
            .then((result) => send({ jsonrpc: "2.0", id: message.id, result }))
            .catch(() => send({ jsonrpc: "2.0", id: message.id, result: { outcome: { outcome: "cancelled" } } }))
          continue
        }
        if (!promptSent || message.params?._meta?.isReplay === true) continue
        const subagentEvent = subagentEventFromMessage(message)
        if (subagentEvent) callbacks.onSubagent?.(subagentEvent)
        if (message.method !== "session/update") continue
        const update = message.params?.update || {}
        const text = update.content?.text
        if (update.sessionUpdate === "agent_message_chunk" && typeof text === "string" && text) { output += text; callbacks.onText?.(text) }
        else if (update.sessionUpdate === "agent_thought_chunk" && typeof text === "string" && text) callbacks.onThought?.(text)
        else if (update.sessionUpdate === "tool_call") callbacks.onTool?.(String(update.title || update.rawInput?.command || "tool").slice(0, 160))
      }
    })
    child.stderr?.on("data", (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-4_000) })
    child.on("error", (error) => fail(new Error(`Grok ACP failed: ${error.message}`)))
    child.on("close", (code) => { if (!settled) fail(new Error(`Grok ACP exited ${code}${stderr ? `: ${stderr.trim()}` : ""}`)) })

    void (async () => {
      try {
        const initialized = await request("initialize", { protocolVersion: 1, clientCapabilities: { fs: { readTextFile: false, writeTextFile: false } } }, TIMEOUTS.initialize) as Record<string, any>
        const authMethods = Array.isArray(initialized.authMethods) ? initialized.authMethods : []
        if (!authMethods.some((method: any) => method?.id === "cached_token")) throw new Error("Grok is not signed in. Run `grok login` or use the default headless transport.")
        await request("authenticate", { methodId: "cached_token" }, TIMEOUTS.authenticate)
        const started = await request("session/new", { cwd: options.cwd, mcpServers: [] }, TIMEOUTS.session) as Record<string, any>
        sessionId = typeof started.sessionId === "string" ? started.sessionId : ""
        if (!sessionId) throw new Error("Grok ACP did not return a session ID")
        callbacks.onSession?.(sessionId)
        promptSent = true
        const completed = await request("session/prompt", { sessionId, prompt: [{ type: "text", text: prompt }] }, TIMEOUTS.prompt) as Record<string, any>
        finish(typeof completed.stopReason === "string" ? completed.stopReason : null)
      } catch (error) { fail(error instanceof Error ? error : new Error(String(error))) }
    })()
  })
}
