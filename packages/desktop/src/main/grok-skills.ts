import { existsSync, readdirSync, readFileSync, statSync } from "fs"
import { homedir } from "os"
import { join, dirname } from "path"

export type GrokSkill = { name: string; description: string; path: string; scope: "project" | "user" | "compatible" }

/**
 * Parse a single YAML frontmatter key. Supports the folded scalar form
 * (`description: >`) where the value continues across indented lines until
 * the next key at column 0, which is the format Anthropic and Grok skills use
 * for longer descriptions. Returns the trimmed value (or "" if absent).
 */
function parseFrontmatterValue(text: string, key: string): string {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const direct = text.match(new RegExp(`^${escapedKey}:\\s+(?!>|\\|)([^\\n]+)$`, "m"))
  if (direct) return direct[1]!.trim().replace(/^['"]|['"]$/g, "")
  const folded = text.match(new RegExp(`^${escapedKey}:\\s*([>|][+-]?)\\s*$`, "m"))
  if (!folded) return ""
  // The folded scalar body begins on the next line, indented at least two
  // spaces, and continues until a line returns to column 0.
  const indentRegex = new RegExp(`^\\s{2,}([^\\n]+(?:\\n\\s{2,}[^\\n]+)*)`, "m")
  const after = text.slice((folded.index ?? 0) + folded[0].length)
  const block = after.match(indentRegex)
  if (block) return block[1]!.replace(/\n\s{2,}/g, " ").trim().replace(/^['"]|['"]$/g, "")
  return ""
}

function walk(root: string, scope: GrokSkill["scope"], output: GrokSkill[]): void {
  if (!existsSync(root)) return
  for (const entry of readdirSync(root)) {
    const path = join(root, entry)
    let stat; try { stat = statSync(path) } catch { continue }
    if (stat.isDirectory()) walk(path, scope, output)
    else if (entry === "SKILL.md") {
      const text = readFileSync(path, "utf8")
      const name = parseFrontmatterValue(text, "name") || dirname(path).split("/").pop() || "Unnamed skill"
      const description = parseFrontmatterValue(text, "description")
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
