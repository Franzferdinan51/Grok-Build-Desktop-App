import { existsSync, readdirSync, readFileSync, statSync } from "fs"
import { homedir } from "os"
import { join, dirname } from "path"

export type GrokSkill = { name: string; description: string; path: string; scope: "project" | "user" | "compatible" }

function walk(root: string, scope: GrokSkill["scope"], output: GrokSkill[]): void {
  if (!existsSync(root)) return
  for (const entry of readdirSync(root)) {
    const path = join(root, entry)
    let stat; try { stat = statSync(path) } catch { continue }
    if (stat.isDirectory()) walk(path, scope, output)
    else if (entry === "SKILL.md") {
      const text = readFileSync(path, "utf8")
      const name = text.match(/^name:\s*(.+)$/m)?.[1]?.trim() || dirname(path).split("/").pop() || "Unnamed skill"
      const description = text.match(/^description:\s*(.+)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g, "") || ""
      output.push({ name, description, path, scope })
    }
  }
}

export function listGrokSkills(workspace?: string): GrokSkill[] {
  const found: GrokSkill[] = []
  if (workspace) { walk(join(workspace, ".grok", "skills"), "project", found); walk(join(workspace, ".agents", "skills"), "project", found) }
  walk(join(homedir(), ".grok", "skills"), "user", found)
  walk(join(homedir(), ".agents", "skills"), "compatible", found)
  walk(join(homedir(), ".claude", "skills"), "compatible", found)
  const unique = new Map<string, GrokSkill>(); for (const skill of found) if (!unique.has(skill.name)) unique.set(skill.name, skill)
  return [...unique.values()].sort((a, b) => a.name.localeCompare(b.name))
}
