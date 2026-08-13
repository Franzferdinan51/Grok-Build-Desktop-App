/**
 * Duck-Agent governed prompt presets, executed only through Grok Build.
 * Official Rhai workflows live in .grok/workflows and take precedence
 * when /workflow matches a discovered script name.
 * This module never starts a second agent runtime.
 */

export const WORKFLOW_NAMES = ["plan", "research", "code", "operate"] as const
export type WorkflowName = (typeof WORKFLOW_NAMES)[number]

export const WORKFLOWS: Record<WorkflowName, { description: string; noPlan: boolean; permissionMode?: "plan" | "auto"; selfVerify?: boolean; disableWebSearch?: boolean }> = {
  plan: { description: "Turn a goal into an explicit, reviewable plan before execution.", noPlan: false, permissionMode: "plan" },
  research: { description: "Gather sources and preserve links/evidence for claims.", noPlan: true, disableWebSearch: false },
  code: { description: "Run implementation through Grok Build with progress and verification.", noPlan: true, permissionMode: "auto", selfVerify: true },
  operate: { description: "Inspect status, diagnose the environment, and perform bounded operations.", noPlan: true, permissionMode: "auto" },
}

export function parseWorkflowName(input: string): WorkflowName | undefined {
  const name = input.trim().toLowerCase().split(/\s+/)[0]
  return WORKFLOW_NAMES.find((entry) => entry === name)
}

export function frameWorkflowPrompt(workflow: WorkflowName, goal: string): string {
  const trimmed = goal.trim()
  return `[Duck-Agent ${workflow} workflow]
Goal: ${trimmed || "Use the current workspace conversation as the goal."}
${WORKFLOWS[workflow].description}
Treat this as a governed Grok Build task: explain the plan, do the work with real tools, then report what actually ran. Do not claim verification you did not perform.`
}
