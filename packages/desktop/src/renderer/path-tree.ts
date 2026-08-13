/**
 * Compact folder trees for workspace and review.
 * Mirrors Duck Agent / Hermes `buildReviewTree`: single-child directory
 * chains collapse to `a/b/c` so sparse paths stay readable.
 */

export type PathTreeNode<T> = {
  id: string
  name: string
  isDir: boolean
  path: string
  data?: T
  children?: PathTreeNode<T>[]
}

export type VisibleTreeRow<T> = {
  node: PathTreeNode<T>
  depth: number
}

type MutableDir<T> = {
  id: string
  name: string
  dirs: Map<string, MutableDir<T>>
  files: PathTreeNode<T>[]
}

const makeDir = <T,>(id: string, name: string): MutableDir<T> => ({
  id,
  name,
  dirs: new Map(),
  files: [],
})

export function buildPathTree<T>(entries: { path: string; data: T }[], compact = true): PathTreeNode<T>[] {
  const root = makeDir<T>("", "")

  for (const entry of entries) {
    const segments = entry.path.split(/[/\\]/).filter(Boolean)
    const fileName = segments.pop() ?? entry.path
    let dir = root
    let prefix = ""

    for (const segment of segments) {
      prefix = prefix ? `${prefix}/${segment}` : segment
      let child = dir.dirs.get(segment)
      if (!child) {
        child = makeDir<T>(prefix, segment)
        dir.dirs.set(segment, child)
      }
      dir = child
    }

    dir.files.push({
      id: entry.path,
      name: fileName,
      isDir: false,
      path: entry.path,
      data: entry.data,
    })
  }

  const finalize = (dir: MutableDir<T>): PathTreeNode<T>[] => {
    const dirNodes = [...dir.dirs.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((child) => {
        let node: PathTreeNode<T> = {
          id: child.id,
          name: child.name,
          isDir: true,
          path: child.id,
          children: finalize(child),
        }
        while (compact && node.children?.length === 1 && node.children[0].isDir) {
          const only = node.children[0]
          node = { ...only, name: `${node.name}/${only.name}` }
        }
        return node
      })
    const fileNodes = [...dir.files].sort((a, b) => a.name.localeCompare(b.name))
    return [...dirNodes, ...fileNodes]
  }

  return finalize(root)
}

export function flattenPathTree<T>(nodes: PathTreeNode<T>[], expanded: ReadonlySet<string>, depth = 0): VisibleTreeRow<T>[] {
  const rows: VisibleTreeRow<T>[] = []
  for (const node of nodes) {
    rows.push({ node, depth })
    if (node.isDir && expanded.has(node.id) && node.children?.length) {
      rows.push(...flattenPathTree(node.children, expanded, depth + 1))
    }
  }
  return rows
}

export function firstLevelDirIds(nodes: PathTreeNode<unknown>[]): string[] {
  return nodes.filter((node) => node.isDir).map((node) => node.id)
}

export function ancestorIds(path: string): string[] {
  const segments = path.split(/[/\\]/).filter(Boolean)
  segments.pop()
  const ids: string[] = []
  let prefix = ""
  for (const segment of segments) {
    prefix = prefix ? `${prefix}/${segment}` : segment
    ids.push(prefix)
  }
  return ids
}

export function filterByPath<T extends { path: string }>(items: T[], query: string): T[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return items
  return items.filter((item) => item.path.toLowerCase().includes(needle))
}
