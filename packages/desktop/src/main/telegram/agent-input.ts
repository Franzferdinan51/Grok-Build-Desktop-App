/**
 * telegram/agent-input.ts — Build the Grok Build input for a Telegram task.
 *
 * Pure value builder extracted from main/index.ts so the dispatcher in
 * `agent-handler.ts` can run with a thin interface (`AgentHandlerDeps`)
 * and so this builder can be exercised from `smoke.mjs` without booting
 * the Grok Build CLI.
 */

import { mkdirSync } from "fs"
import { app } from "electron"
import { join } from "path"
import { getStore } from "../store"
import { telegramTaskNeedsMoa } from "../telegram-agent-policy"
import type { RunTaskInput } from "../grok-build-backend"
import type { TelegramAgentSession } from "./agent-handler"

export async function buildAgentInput(chatId: string, taskText: string, agent: TelegramAgentSession): Promise<RunTaskInput | undefined> {
  const storedWorkspace = agent.workspace || getStore().get("workspace.last") as string | undefined
  const cwd = storedWorkspace || join(app.getPath("userData"), "Scratch")
  mkdirSync(cwd, { recursive: true })
  const transcript = agent.transcript || []
  const fallbackContext = [
    `Earlier checkpoint:\n${agent.compressedSummary || ""}`,
    ...transcript.slice(-10).map((entry) => `${entry.role === "user" ? "User" : "Assistant"}: ${entry.text}`),
  ].filter((entry) => !entry.endsWith("\n")).join("\n\n").slice(-20_000)
  void chatId
  const appControls = Boolean(getStore().get("agent.appControls"))
  const agentPrompt = appControls
    ? `${taskText.slice(0, 20_000)}\n\n## Safe host actions\nWhen the user explicitly asks to schedule future work, append exactly one validated action tag to your answer:\n<app_action>{"type":"schedule.create","name":"Task name","prompt":"Task prompt","runAt":1770000000000,"repeatMinutes":60}</app_action>\nUse an absolute future Unix timestamp in milliseconds. Omit repeatMinutes for one-time work. Never put credentials or shell commands in an action.`
    : taskText.slice(0, 20_000)
  const moaEnabled = Boolean(getStore().get("moa.enabled"))
  const moaReferences = ((getStore().get("moa.referenceModels") as string[] | undefined) || []).filter(Boolean).slice(0, 8)
  const responseMode = agent.mode || "balanced"
  const useMoa = moaEnabled && responseMode !== "fast" && moaReferences.length >= 2 && telegramTaskNeedsMoa(taskText)
  const activeReferences = responseMode === "deep" ? moaReferences : moaReferences.slice(0, 2)
  return {
    prompt: agentPrompt,
    cwd,
    model: agent.model || getStore().get("defaults.model") as string | undefined,
    resume: agent.sessionId || undefined,
    resumeFallbackPrompt: fallbackContext ? `Continue this Telegram agent conversation using the context below. Preserve prior decisions and unfinished work.\n\n${fallbackContext}\n\nCurrent instruction:\n${agentPrompt}` : undefined,
    permissionMode: "auto" as const,
    noPlan: true,
    thinking: agent.thinking ?? ((getStore().get("defaults.thinking") as boolean | undefined) ?? true),
    selfVerify: Boolean(getStore().get("defaults.selfVerify")),
    maxTurns: (getStore().get("defaults.maxTurns") as number | undefined) || undefined,
    disableWebSearch: getStore().get("defaults.webSearch") === false,
    subagents: (getStore().get("agent.subagents") as boolean | undefined) ?? true,
    longTermMemory: Boolean(getStore().get("memory.telegramEnabled")),
    moa: useMoa ? {
      referenceModels: activeReferences,
      aggregatorModel: (getStore().get("moa.aggregatorModel") as string | undefined) || agent.model,
      referenceReasoningEffort: responseMode === "deep" ? ((getStore().get("moa.referenceEffort") as "low" | "medium" | "high" | undefined) || "medium") : "low",
      aggregatorReasoningEffort: (getStore().get("moa.aggregatorEffort") as "low" | "medium" | "high" | undefined) || "high",
      referenceTokenBudget: responseMode === "deep" ? ((getStore().get("moa.referenceTokenBudget") as number | undefined) || 600) : Math.min(400, (getStore().get("moa.referenceTokenBudget") as number | undefined) || 600),
      referenceTimeoutMs: responseMode === "deep" ? 90_000 : 25_000,
      context: fallbackContext || undefined,
    } : undefined,
  }
}
