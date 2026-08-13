/**
 * Resolve /workflow arguments against official Grok Build Rhai names
 * first, then Duck-Agent prompt presets. Official names always win.
 */

import { frameWorkflowPrompt, parseWorkflowName, WORKFLOWS, type WorkflowName } from "./workflow-presets.ts"

export type OfficialWorkflowRef = { name: string; description?: string; scope?: string }

export type WorkflowLaunch =
  | { kind: "list" }
  | { kind: "official"; name: string; prompt: string }
  | { kind: "control"; prompt: string }
  | { kind: "preset"; name: WorkflowName; prompt: string; noPlan: boolean; permissionMode?: "plan" | "auto" }

const CONTROL = new Set(["pause", "resume", "stop", "save"])

export function resolveWorkflowLaunch(args: string, official: OfficialWorkflowRef[]): WorkflowLaunch {
  const trimmed = args.trim()
  if (!trimmed) return { kind: "list" }
  const [first = "", ...rest] = trimmed.split(/\s+/)
  const token = first.toLowerCase()
  const remainder = rest.join(" ").trim()
  if (CONTROL.has(token)) {
    return { kind: "control", prompt: remainder ? `/workflow ${token} ${remainder}` : `/workflow ${token}` }
  }
  const match = official.find((entry) => entry.name.toLowerCase() === token)
  if (match) {
    return { kind: "official", name: match.name, prompt: remainder ? `/workflow ${match.name} ${remainder}` : `/workflow ${match.name}` }
  }
  const preset = parseWorkflowName(token)
  if (preset) {
    const spec = WORKFLOWS[preset]
    return { kind: "preset", name: preset, prompt: frameWorkflowPrompt(preset, remainder), noPlan: spec.noPlan, permissionMode: spec.permissionMode }
  }
  return { kind: "official", name: first, prompt: remainder ? `/workflow ${first} ${remainder}` : `/workflow ${first}` }
}

export function formatWorkflowCatalog(official: OfficialWorkflowRef[]): string {
  const lines = ["Official Grok Build workflows (.rhai):"]
  if (official.length) {
    for (const entry of official) {
      const scope = entry.scope ? ` (${entry.scope})` : ""
      lines.push(`  ${entry.name}${scope}${entry.description ? ` — ${entry.description}` : ""}`)
    }
  } else {
    lines.push("  none discovered in .grok/workflows or ~/.grok/workflows")
  }
  lines.push("", "Duck-Agent presets (prompt wrappers, not Rhai): plan, research, code, operate")
  lines.push("Launch: /workflow <name> [args]")
  lines.push("Control: /workflow pause|resume|stop <display-name>")
  return lines.join("\n")
}
