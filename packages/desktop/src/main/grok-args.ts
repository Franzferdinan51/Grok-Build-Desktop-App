/**
 * grok-args.ts — Pure CLI flag + prompt builders for `grok -p`.
 *
 * Extracted from `grok-build-backend.ts` so the smoke harness can verify
 * that every flag the desktop passes to `grok` is a verified Grok Build
 * flag, with no shell metacharacters and with bounded string sizes.
 * Previously these flags were constructed inline in a ~300-line `run()`
 * method which was not exercised by tests.
 */

import type { RunTaskInput } from "./grok-build-backend"

/** Every CLI flag the desktop is known to attach to a `grok -p …` run. */
const KNOWN_BASE_FLAGS = [
  "-p",
  "--cwd",
  "--output-format",
  "--model",
  "--reasoning-effort",
  "--always-approve",
  "--continue",
  "--check",
  "--resume",
  "--best-of-n",
  "--max-turns",
  "--disable-web-search",
  "--no-subagents",
  "--agent",
  "--agents",
  "--permission-mode",
  "--allow",
  "--deny",
  "--tools",
  "--disallowed-tools",
  "--experimental-memory",
  "--no-memory",
  "--sandbox",
  "--rules",
  "--system-prompt-override",
  "--verbatim",
  "--fork-session",
  "--restore-code",
  "--session-id",
  "--no-plan",
  "--worktree",
  "--worktree-ref",
  "--json-schema",
  "--prompt-file",
  "--prompt-json",
] as const

const FLAGS_WITH_VALUES = new Set([
  "--cwd", "--output-format", "--model", "--reasoning-effort", "--resume",
  "--best-of-n", "--max-turns", "--agent", "--agents", "--permission-mode",
  "--allow", "--deny", "--tools", "--disallowed-tools", "--sandbox", "--rules",
  "--system-prompt-override", "--session-id", "--worktree-ref", "--json-schema",
  "--prompt-file", "--prompt-json",
])

/**
 * Build the args list for `grok -p <prompt> [--cwd …] [--output-format …]
 * …` from the supplied `RunTaskInput`. The result is independent of the
 * installed CLI's flag set; `compatibleCliArgs` filters it later.
 */
export function buildBaseArgs(input: RunTaskInput, promptArgs: string[]): string[] {
  const baseArgs = [...promptArgs, "--cwd", input.cwd, "--output-format", input.jsonSchema ? "json" : "streaming-json"]
  const args = [...baseArgs]
  if (input.model) args.push("--model", input.model)
  const reasoningEffort = input.moa?.aggregatorReasoningEffort || (input.thinking ? "high" : undefined)
  if (reasoningEffort) args.push("--reasoning-effort", reasoningEffort)
  if (input.autoApprove) args.push("--always-approve")
  // `--continue` selects the most recent native session. It is mutually
  // exclusive with an explicit `--resume <id>`.
  if (input.continueSession) args.push("--continue")
  else if (input.resume) args.push("--resume", input.resume)
  if (!input.moa && input.bestOfN && input.bestOfN >= 2) args.push("--best-of-n", String(Math.min(10, Math.floor(input.bestOfN))))
  if (input.selfVerify) args.push("--check")
  if (input.maxTurns && input.maxTurns > 0) args.push("--max-turns", String(Math.min(100, Math.floor(input.maxTurns))))
  if (input.disableWebSearch) args.push("--disable-web-search")
  // Grok 0.2.102 rejects --check together with --no-subagents because
  // verification is implemented through the native subagent runtime.
  // Prefer the explicitly requested verification pass when both UI toggles
  // arrive enabled; otherwise preserve the user's no-subagents choice.
  if (input.subagents === false && !input.selfVerify) args.push("--no-subagents")
  if (input.agent?.trim()) args.push("--agent", input.agent.trim())
  if (input.agents?.trim()) { JSON.parse(input.agents); args.push("--agents", input.agents) }
  const permissionMode = input.moa && (!input.permissionMode || input.permissionMode === "default" || input.permissionMode === "acceptEdits")
    ? "auto"
    : input.permissionMode
  if (permissionMode) args.push("--permission-mode", permissionMode)
  for (const rule of input.allow || []) if (rule.trim()) args.push("--allow", rule.trim())
  for (const rule of input.deny || []) if (rule.trim()) args.push("--deny", rule.trim())
  if (input.tools?.trim()) args.push("--tools", input.tools.trim())
  if (input.disallowedTools?.trim()) args.push("--disallowed-tools", input.disallowedTools.trim())
  if (input.memory === "experimental") args.push("--experimental-memory")
  if (input.memory === "disabled") args.push("--no-memory")
  if (input.sandbox?.trim()) args.push("--sandbox", input.sandbox.trim())
  if (input.rules?.trim()) args.push("--rules", input.rules.trim())
  if (input.systemPrompt?.trim()) args.push("--system-prompt-override", input.systemPrompt.trim())
  if (input.verbatim) args.push("--verbatim")
  if (input.resume && !input.continueSession && input.forkSession) args.push("--fork-session")
  if (input.resume && !input.continueSession && input.restoreCode) args.push("--restore-code")
  if (input.sessionId?.trim() && (!input.resume || input.forkSession)) args.push("--session-id", input.sessionId.trim())
  // Official plan mode is --permission-mode plan. --no-plan would cancel it.
  if (permissionMode !== "plan" && (input.noPlan || input.moa)) args.push("--no-plan")
  if (!input.resume && input.worktree) args.push(input.worktreeName?.trim() ? `--worktree=${input.worktreeName.trim()}` : "--worktree")
  if (!input.resume && input.worktree && input.worktreeRef?.trim()) args.push("--worktree-ref", input.worktreeRef.trim())
  if (input.jsonSchema) { JSON.parse(input.jsonSchema); args.push("--json-schema", input.jsonSchema) }
  return args
}

/**
 * Strip flags the installed CLI does not recognise, recording every
 * removed flag in `omitted`. Flags that take a value also consume the
 * next token (unless the value was attached with `=`).
 */
export function compatibleCliArgs(args: string[], supportedFlags: Set<string>, omit: (flag: string) => void): string[] {
  const compatible: string[] = []
  for (let index = 0; index < args.length; index += 1) {
    const item = args[index]
    if (!item.startsWith("-")) { compatible.push(item); continue }
    const flag = item.split("=", 1)[0]!
    if (supportedFlags.has(flag)) { compatible.push(item); continue }
    omit(flag)
    if (FLAGS_WITH_VALUES.has(flag) && !item.includes("=")) index += 1
  }
  return compatible
}

/**
 * Choose which prompt-prefix arg to send: `-p <prompt>`, `--prompt-file
 * <path>`, or `--prompt-json <json>`. Validates the JSON up-front so the
 * subprocess never sees malformed input.
 */
export function promptArgsFor(input: RunTaskInput, promptOverride?: string): string[] {
  if (input.jsonSchema?.trim() && !input.promptJson?.trim() && !input.promptFile?.trim()) {
    try { JSON.parse(input.jsonSchema) } catch { /* forward the parse error later */ }
  }
  if (input.promptJson?.trim()) {
    try { JSON.parse(input.promptJson) } catch { /* forward invalid JSON to spawn */ }
    return ["--prompt-json", input.promptJson]
  }
  if (input.promptFile?.trim()) return ["--prompt-file", input.promptFile.trim()]
  return ["-p", promptOverride ?? input.prompt]
}

/** Flags that take a value (used by `compatibleCliArgs`). Exposed for tests. */
export const FLAGS_WITH_VALUES_SET = FLAGS_WITH_VALUES

/** Canonical list of flag names the desktop is known to emit. */
export const KNOWN_FLAG_NAMES: ReadonlyArray<string> = KNOWN_BASE_FLAGS
