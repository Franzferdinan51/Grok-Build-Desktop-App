import type { WorkspaceFile } from "../preload"

export const MAX_ATTACHED_FILES = 8
export const WORKSPACE_PATHS_MIME = "application/x-grok-workspace-paths"

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
    if (!candidate) continue
    const prefix = `${root}/`
    const comparableCandidate = compare(candidate)
    const comparablePrefix = compare(prefix)
    const relative = comparableCandidate.startsWith(comparablePrefix)
      ? candidate.slice(prefix.length).replace(/^\.\//, "")
      : candidate.includes(":") || candidate.startsWith("/") ? "" : candidate
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

export function leftoverDroppedPaths(workspaceRoot: string, droppedPaths: string[], files: WorkspaceFile[]): string[] {
  const accepted = new Set(droppedWorkspaceFiles(workspaceRoot, droppedPaths, files).map((file) => normalizePath(file.path)))
  const leftovers: string[] = []
  for (const droppedPath of droppedPaths) {
    const candidate = normalizePath(droppedPath)
    if (!candidate) continue
    const root = normalizePath(workspaceRoot)
    const relative = candidate.startsWith(`${root}/`) ? candidate.slice(root.length + 1) : candidate
    if (accepted.has(normalizePath(relative))) continue
    leftovers.push(droppedPath)
  }
  return leftovers
}

export function appendPathText(prompt: string, paths: string[]): string {
  if (!paths.length) return prompt
  const block = paths.join("\n")
  return prompt.trim() ? `${prompt.replace(/\s+$/, "")}\n${block}` : block
}

export function serializeWorkspacePathPayload(files: Array<{ path: string; size?: number }>): string {
  return JSON.stringify(files.map((file) => ({ path: file.path, size: file.size ?? 0 })))
}

export function parseWorkspacePathPayload(raw: string): Array<{ path: string; size?: number }> {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((item) => {
      if (!item || typeof item !== "object") return []
      const path = (item as { path?: unknown }).path
      if (typeof path !== "string" || !path.trim()) return []
      const size = (item as { size?: unknown }).size
      return [{ path: path.trim(), size: typeof size === "number" && Number.isFinite(size) ? size : 0 }]
    })
  } catch {
    return []
  }
}

export function setWorkspacePathDragData(dataTransfer: DataTransfer, file: { path: string; size?: number }) {
  dataTransfer.setData(WORKSPACE_PATHS_MIME, serializeWorkspacePathPayload([file]))
  dataTransfer.setData("text/plain", file.path)
  dataTransfer.effectAllowed = "copy"
}

export function dropLooksLikeFiles(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) return false
  const types = Array.from(dataTransfer.types || [])
  return types.includes(WORKSPACE_PATHS_MIME) || types.includes("Files") || types.includes("text/uri-list")
}

function stripFileUrl(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ""
  if (/^file:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed)
      let path = decodeURIComponent(url.pathname)
      if (/^\/[A-Za-z]:\//.test(path)) path = path.slice(1)
      return path
    } catch {
      return trimmed.replace(/^file:\/\//i, "")
    }
  }
  return trimmed
}

export function extractDroppedAbsolutePaths(dataTransfer: DataTransfer, pathForFile?: (file: { path?: string }) => string): string[] {
  const paths: string[] = []
  const seen = new Set<string>()
  const add = (value: string) => {
    const path = stripFileUrl(value)
    if (!path || seen.has(path)) return
    seen.add(path)
    paths.push(path)
  }
  const internal = dataTransfer.getData(WORKSPACE_PATHS_MIME)
  if (internal) {
    for (const entry of parseWorkspacePathPayload(internal)) add(entry.path)
  }
  for (const file of Array.from(dataTransfer.files || [])) {
    const fromApi = pathForFile?.(file as { path?: string })
    const fromLegacy = (file as { path?: string }).path
    add(fromApi || fromLegacy || "")
  }
  const uriList = dataTransfer.getData("text/uri-list")
  if (uriList) {
    for (const line of uriList.split(/\r?\n/)) {
      if (!line || line.startsWith("#")) continue
      add(line)
    }
  }
  return paths
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
