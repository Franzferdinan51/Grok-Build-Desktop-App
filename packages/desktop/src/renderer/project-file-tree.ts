import type { WorkspaceFile } from "../preload"

export type ProjectFileTreeNode = { name: string; path: string; kind: "file" | "folder"; size?: number; children: ProjectFileTreeNode[] }

export function buildProjectFileTree(files: WorkspaceFile[]): ProjectFileTreeNode[] {
  const roots: ProjectFileTreeNode[] = []
  const folders = new Map<string, ProjectFileTreeNode>()
  for (const file of files) {
    const parts = file.path.split(/[\\/]+/).filter(Boolean)
    if (!parts.length) continue
    let children = roots
    let currentPath = ""
    for (const [index, part] of parts.entries()) {
      currentPath = currentPath ? `${currentPath}/${part}` : part
      if (index === parts.length - 1) { children.push({ name: part, path: file.path, kind: "file", size: file.size, children: [] }); continue }
      let folder = folders.get(currentPath)
      if (!folder) { folder = { name: part, path: currentPath, kind: "folder", children: [] }; folders.set(currentPath, folder); children.push(folder) }
      children = folder.children
    }
  }
  const sort = (nodes: ProjectFileTreeNode[]) => { nodes.sort((a, b) => Number(b.kind === "folder") - Number(a.kind === "folder") || a.name.localeCompare(b.name)); for (const node of nodes) sort(node.children) }
  sort(roots)
  return roots
}

