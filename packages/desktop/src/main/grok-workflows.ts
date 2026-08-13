/**
 * Discover official Grok Build Rhai workflows.
 *
 * Project: <workspace>/.grok/workflows/*.rhai
 * User:    ~/.grok/workflows/*.rhai  (or $GROK_HOME/workflows)
 *
 * There is no `grok workflow` CLI subcommand. Headless launch is
 * `grok -p "/workflow <name> …"` so the agent uses the workflow tool.
 */

import { existsSync, readdirSync, readFileSync } from "fs"
import { basename, join } from "path"
import { grokHome } from "./grok-session-files.ts"

export type GrokWorkflow = {
  name: string
  description: string
  path: string
  scope: "project" | "user"
}

const META_BLOCK = /let\s+meta\s*=\s*#\{([\s\S]*?)\n\s*\}\s*;/
const META_STRING = /\b(name|description)\s*:\s*["']([^"']+)["']/g

export function parseWorkflowMeta(source: string): { name?: string; description?: string } {
  const block = source.match(META_BLOCK)?.[1] ?? source.slice(0, 2_000)
  const found: { name?: string; description?: string } = {}
  for (const match of block.matchAll(META_STRING)) {
    const key = match[1]
    const value = match[2]?.trim()
    if (!key || !value || found[key as "name" | "description"]) continue
    found[key as "name" | "description"] = value
  }
  return found
}

function collectWorkflows(dir: string, scope: GrokWorkflow["scope"], output: GrokWorkflow[]): void {
  if (!existsSync(dir)) return
  let entries: string[]
  try { entries = readdirSync(dir) }
  catch { return }
  for (const entry of entries) {
    if (!entry.endsWith(".rhai")) continue
    const path = join(dir, entry)
    let source = ""
    try { source = readFileSync(path, "utf8") }
    catch { continue }
    const meta = parseWorkflowMeta(source)
    output.push({
      name: meta.name || basename(entry, ".rhai"),
      description: meta.description || "",
      path,
      scope,
    })
  }
}

export function listGrokWorkflows(workspace?: string, env: NodeJS.ProcessEnv = process.env): GrokWorkflow[] {
  const found: GrokWorkflow[] = []
  if (workspace?.trim()) collectWorkflows(join(workspace, ".grok", "workflows"), "project", found)
  collectWorkflows(join(grokHome(env), "workflows"), "user", found)
  const unique = new Map<string, GrokWorkflow>()
  for (const workflow of found) if (!unique.has(workflow.name)) unique.set(workflow.name, workflow)
  return [...unique.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export function officialWorkflowPrompt(name: string, rest = ""): string {
  const extra = rest.trim()
  return extra ? `/workflow ${name} ${extra}` : `/workflow ${name}`
}
