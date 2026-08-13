import type { WorkspaceFile } from "../preload"

export const MAX_ATTACHED_FILES = 8

function normalizePath(value: string): string {
  return value.replaceAll("\\", "/").replace(/\/+/g, "/").replace(/\/$/, "")
}

function isWindowsPath(value: string): boolean {
  return /^[A-Za-z]:\//.test(value)
}

/**
 * Resolve native dropped paths against the already-scanned workspace file list.
 * The allowlist is intentional: a renderer drop can only attach a file that the
 * main process has already reported as a regular workspace file.
 */
export function droppedWorkspaceFiles(
  workspaceRoot: string,
  droppedPaths: string[],
  files: WorkspaceFile[],
  attachedCount = 0,
): WorkspaceFile[] {
  const root = normalizePath(workspaceRoot)
  if (!root || attachedCount >= MAX_ATTACHED_FILES) return []
  const insensitive = isWindowsPath(root)
  const compare = (value: string) => insensitive ? value.toLowerCase() : value
  const known = new Map(files.map((file) => [compare(normalizePath(file.path)), file]))
  const seen = new Set<string>()
  const remaining = MAX_ATTACHED_FILES - attachedCount
  const accepted: WorkspaceFile[] = []

  for (const droppedPath of droppedPaths) {
    const candidate = normalizePath(droppedPath)
    const prefix = `${root}/`
    const comparableCandidate = compare(candidate)
    const comparablePrefix = compare(prefix)
    if (!candidate || !comparableCandidate.startsWith(comparablePrefix)) continue
    const relative = candidate.slice(prefix.length).replace(/^\.\//, "")
    if (!relative || relative.split("/").some((segment) => segment === "..")) continue
    const key = compare(normalizePath(relative))
    const file = known.get(key)
    if (!file || seen.has(key)) continue
    seen.add(key)
    accepted.push(file)
    if (accepted.length >= remaining) break
  }
  return accepted
}

export function toggleAttachedFile(current: WorkspaceFile[], file: WorkspaceFile): WorkspaceFile[] {
  const existing = current.some((entry) => entry.path === file.path)
  if (existing) return current.filter((entry) => entry.path !== file.path)
  if (current.length >= MAX_ATTACHED_FILES) return current
  return [...current, file]
}

export function formatAttachedPrompt(prompt: string, files: WorkspaceFile[]): string {
  const text = prompt.trim()
  if (!files.length) return text
  const context = [
    "[Workspace files attached for context]",
    ...files.map((file) => `- ${file.path}`),
    "Read the attached workspace files before acting; they are context for the instruction below.",
  ].join("\n")
  return `${text}\n\n${context}`.trim()
}
