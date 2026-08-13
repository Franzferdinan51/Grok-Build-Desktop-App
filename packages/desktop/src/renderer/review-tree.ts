import { buildPathTree, filterByPath, firstLevelDirIds, flattenPathTree, type PathTreeNode, type VisibleTreeRow } from "./path-tree.ts"

export type GitChange = { status: string; path: string }
export type ReviewKind = "added" | "modified" | "deleted" | "renamed" | "untracked" | "other"
export type ReviewTreeNode = PathTreeNode<GitChange>
export type ReviewTreeRow = VisibleTreeRow<GitChange>
export type ReviewSummary = {
  total: number
  added: number
  modified: number
  deleted: number
  untracked: number
  renamed: number
}

export function reviewKind(status: string): ReviewKind {
  const code = status.replace(/\s+/g, "")
  if (code === "??" || code === "A" || code.endsWith("A")) return code === "??" ? "untracked" : "added"
  if (code.includes("D")) return "deleted"
  if (code.includes("R") || code.includes("C")) return "renamed"
  if (code.includes("M") || code.includes("U")) return "modified"
  return "other"
}

export function reviewStatusLabel(status: string): string {
  const kind = reviewKind(status)
  if (kind === "untracked") return "U"
  if (kind === "added") return "A"
  if (kind === "deleted") return "D"
  if (kind === "renamed") return "R"
  if (kind === "modified") return "M"
  return status.trim() || "M"
}

export function summarizeReview(changes: GitChange[]): ReviewSummary {
  const summary: ReviewSummary = { total: changes.length, added: 0, modified: 0, deleted: 0, untracked: 0, renamed: 0 }
  for (const change of changes) {
    const kind = reviewKind(change.status)
    if (kind === "added") summary.added += 1
    else if (kind === "modified") summary.modified += 1
    else if (kind === "deleted") summary.deleted += 1
    else if (kind === "untracked") summary.untracked += 1
    else if (kind === "renamed") summary.renamed += 1
  }
  return summary
}

export function buildReviewTree(changes: GitChange[], compact = true): ReviewTreeNode[] {
  return buildPathTree(changes.map((change) => ({ path: change.path, data: change })), compact)
}

export function buildReviewFlatList(changes: GitChange[]): ReviewTreeNode[] {
  return [...changes]
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((change) => {
      const segments = change.path.split(/[/\\]/).filter(Boolean)
      const name = segments.pop() ?? change.path
      return { id: change.path, name, isDir: false, path: change.path, data: change }
    })
}

export function visibleReviewRows(changes: GitChange[], query: string, expanded: ReadonlySet<string>, mode: "tree" | "list" = "tree"): ReviewTreeRow[] {
  const filtered = filterByPath(changes, query)
  if (mode === "list") return buildReviewFlatList(filtered).map((node) => ({ node, depth: 0 }))
  return flattenPathTree(buildReviewTree(filtered), expanded)
}

export function defaultReviewExpanded(changes: GitChange[], query: string): string[] {
  return firstLevelDirIds(buildReviewTree(filterByPath(changes, query)))
}

export type DiffLineKind = "add" | "del" | "hunk" | "meta" | "ctx"

export function diffLineKind(line: string): DiffLineKind {
  if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("diff ") || line.startsWith("index ")) return "meta"
  if (line.startsWith("@@")) return "hunk"
  if (line.startsWith("+")) return "add"
  if (line.startsWith("-")) return "del"
  return "ctx"
}

export function countDiffLines(diff: string): { added: number; removed: number } {
  let added = 0
  let removed = 0
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---")) continue
    if (line.startsWith("+")) added += 1
    else if (line.startsWith("-")) removed += 1
  }
  return { added, removed }
}
