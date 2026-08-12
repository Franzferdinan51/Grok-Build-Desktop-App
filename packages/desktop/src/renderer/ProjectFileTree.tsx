import { createMemo, createSignal, For, Show } from "solid-js"
import type { WorkspaceFile } from "../preload"
import { buildProjectFileTree, type ProjectFileTreeNode } from "./project-file-tree"

function formatFileSize(size: number) { return size > 1024 * 1024 ? `${(size / (1024 * 1024)).toFixed(1)} MB` : size > 1024 ? `${Math.round(size / 1024)} KB` : `${size} B` }

export function ProjectFileTree(props: { files: WorkspaceFile[]; query: string; activePath: string; onSelect: (path: string) => void }) {
  const [open, setOpen] = createSignal<Record<string, boolean>>({})
  const visibleFiles = createMemo(() => { const query = props.query.trim().toLowerCase(); return query ? props.files.filter((file) => file.path.toLowerCase().includes(query)) : props.files })
  const tree = createMemo(() => buildProjectFileTree(visibleFiles()))
  const renderNode = (node: ProjectFileTreeNode, depth: number): any => <>
    <Show when={node.kind === "folder"} fallback={<button class={`project-file ${props.activePath === node.path ? "active" : ""}`} onClick={() => props.onSelect(node.path)} title={node.path} style={{ "padding-left": `${8 + depth * 13}px` }}><span class="project-file__icon">{node.name.match(/\.(tsx?|jsx?|css|json|md)$/i) ? "◇" : "□"}</span><span class="project-file__path">{node.name}</span><small>{formatFileSize(node.size || 0)}</small></button>}>
      <button class="project-file project-file--folder" onClick={() => setOpen((current) => ({ ...current, [node.path]: !current[node.path] }))} aria-expanded={Boolean(open()[node.path])} title={node.path} style={{ "padding-left": `${8 + depth * 13}px` }}><span class="project-file__chevron">{open()[node.path] ? "⌄" : "›"}</span><span class="project-file__icon">▱</span><span class="project-file__path">{node.name}</span><small>{node.children.length}</small></button>
      <Show when={open()[node.path]}><For each={node.children}>{(child) => renderNode(child, depth + 1)}</For></Show>
    </Show>
  </>
  return <Show when={tree().length} fallback={<div class="project-files-empty"><span>⌕</span><strong>No matching files</strong><p>Try a different filter.</p></div>}><For each={tree()}>{(node) => renderNode(node, 0)}</For></Show>
}

