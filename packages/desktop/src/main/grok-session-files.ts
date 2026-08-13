/**
 * Read official Grok Build session artifacts from disk.
 *
 * Layout (user-guide/17-sessions.md + 19-plan-mode.md):
 *   ~/.grok/sessions/<encodeURIComponent(cwd)>/<session-id>/plan.md
 *   ~/.grok/sessions/<encodeURIComponent(cwd)>/<session-id>/plan.json
 *
 * `GROK_HOME` overrides `~/.grok`. When the encoded cwd exceeds 255 bytes,
 * Grok uses a hashed group directory with a `.cwd` marker.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "fs"
import { homedir } from "os"
import { join } from "path"

export type SessionPlan = {
  sessionId: string
  cwd: string
  path: string
  markdown: string
  todos?: unknown
  updatedAt: number
}

const MAX_PLAN_CHARS = 200_000

export function grokHome(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.GROK_HOME?.trim()
  return override || join(homedir(), ".grok")
}

export function encodeSessionCwd(cwd: string): string {
  return encodeURIComponent(cwd)
}

export function sessionGroupDir(cwd: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
  const root = join(grokHome(env), "sessions")
  if (!existsSync(root)) return undefined
  const encoded = encodeSessionCwd(cwd)
  const direct = join(root, encoded)
  if (existsSync(direct)) return direct
  try {
    for (const entry of readdirSync(root)) {
      const dir = join(root, entry)
      const marker = join(dir, ".cwd")
      if (!existsSync(marker)) continue
      try {
        if (readFileSync(marker, "utf8").trim() === cwd) return dir
      } catch { /* skip unreadable markers */ }
    }
  } catch { /* skip unreadable sessions root */ }
  return undefined
}

function readBounded(path: string): string {
  const text = readFileSync(path, "utf8")
  return text.length > MAX_PLAN_CHARS ? `${text.slice(0, MAX_PLAN_CHARS)}\n\n…truncated` : text
}

function planMarkdownPath(sessionDir: string): string | undefined {
  const primary = join(sessionDir, "plan.md")
  if (existsSync(primary)) return primary
  const goal = join(sessionDir, "goal", "plan.md")
  return existsSync(goal) ? goal : undefined
}

function planFromDir(sessionDir: string, sessionId: string, cwd: string): SessionPlan | null {
  const markdownPath = planMarkdownPath(sessionDir)
  if (!markdownPath) return null
  let markdown = ""
  let updatedAt = 0
  try {
    markdown = readBounded(markdownPath).trim()
    updatedAt = statSync(markdownPath).mtimeMs
  } catch { return null }
  if (!markdown) return null
  let todos: unknown
  const jsonPath = join(sessionDir, "plan.json")
  if (existsSync(jsonPath)) {
    try { todos = JSON.parse(readFileSync(jsonPath, "utf8")) }
    catch { /* ignore malformed TODO state */ }
  }
  return { sessionId, cwd, path: markdownPath, markdown, todos, updatedAt }
}

export function planTitle(markdown: string): string {
  const heading = markdown.split(/\r?\n/).map((line) => line.trim()).find((line) => line.startsWith("#"))
  return heading ? heading.replace(/^#+\s*/, "").trim() : "Saved Grok Build plan"
}

export function readSessionPlan(cwd: string, sessionId?: string, env: NodeJS.ProcessEnv = process.env): SessionPlan | null {
  const requested = sessionId?.trim()
  if (!requested) return null
  const group = sessionGroupDir(cwd, env)
  if (!group) return null
  return planFromDir(join(group, requested), requested, cwd)
}
