import { ancestorIds, buildPathTree, filterByPath, firstLevelDirIds, flattenPathTree, type PathTreeNode, type VisibleTreeRow } from "./path-tree.ts"

export type WorkspaceFileEntry = { path: string; size: number }
export type FileTreeNode = PathTreeNode<WorkspaceFileEntry>
export type FileTreeRow = VisibleTreeRow<WorkspaceFileEntry>

const FILE_GLYPHS: Record<string, string> = {
  ts: "TS",
  tsx: "TS",
  js: "JS",
  jsx: "JS",
  mjs: "JS",
  cjs: "JS",
  json: "{}",
  md: "MD",
  css: "#",
  scss: "#",
  html: "</>",
  svg: "◇",
  png: "▣",
  jpg: "▣",
  jpeg: "▣",
  gif: "▣",
  webp: "▣",
  py: "PY",
  rs: "RS",
  go: "GO",
  java: "JV",
  kt: "KT",
  rb: "RB",
  sh: "$>",
  zsh: "$>",
  toml: "[]",
  yml: "Y",
  yaml: "Y",
  lock: "⬡",
}

export function buildFileTree(files: WorkspaceFileEntry[], compact = true): FileTreeNode[] {
  return buildPathTree(files.map((file) => ({ path: file.path, data: file })), compact)
}

export function visibleFileRows(files: WorkspaceFileEntry[], query: string, expanded: ReadonlySet<string>, compact = true): FileTreeRow[] {
  return flattenPathTree(buildFileTree(filterByPath(files, query), compact), expanded)
}

export function defaultFileExpanded(files: WorkspaceFileEntry[], query: string, compact = true): string[] {
  return firstLevelDirIds(buildFileTree(filterByPath(files, query), compact))
}

export function expandToFile(path: string, current: Iterable<string>): string[] {
  return [...new Set([...current, ...ancestorIds(path)])]
}

export function fileGlyph(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() || ""
  return FILE_GLYPHS[ext] || "·"
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10_240 ? 1 : 0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function fileBasename(path: string): string {
  return path.split(/[/\\]/).filter(Boolean).pop() || path
}
