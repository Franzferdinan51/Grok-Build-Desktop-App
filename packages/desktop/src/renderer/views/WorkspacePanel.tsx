import { For, Show, createEffect, createMemo, createSignal } from "solid-js"
import type { WorkspaceFile } from "../../preload"
import { defaultFileExpanded, expandToFile, fileBasename, fileGlyph, formatFileSize, visibleFileRows } from "../file-tree"
import { PageEmpty, PageShell } from "./PageShell"

export function WorkspacePanel(props: {
  workspace: string
  projectName: string
  files: WorkspaceFile[]
  fileSearch: string
  onFileSearch: (value: string) => void
  openFile: string
  fileContent: string
  fileNotice: string
  onRefresh: () => void
  onSelectFile: (path: string) => void
  onContentChange: (value: string) => void
  onSave: () => void
  onOpenProject: () => void
}) {
  const [mode, setMode] = createSignal<"tree" | "list">("tree")
  const [expanded, setExpanded] = createSignal<Set<string>>(new Set())

  createEffect(() => {
    const files = props.files
    const query = props.fileSearch
    setExpanded(new Set(defaultFileExpanded(files, query)))
  })

  createEffect(() => {
    const path = props.openFile
    if (!path) return
    setExpanded((current) => new Set(expandToFile(path, current)))
  })

  const rows = createMemo(() => {
    if (mode() === "list") {
      const needle = props.fileSearch.trim().toLowerCase()
      return props.files
        .filter((file) => !needle || file.path.toLowerCase().includes(needle))
        .map((file) => ({
          node: { id: file.path, name: fileBasename(file.path), isDir: false, path: file.path, data: file },
          depth: 0,
        }))
    }
    return visibleFileRows(props.files, props.fileSearch, expanded())
  })

  const toggleDir = (id: string) => {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const openMeta = createMemo(() => props.files.find((file) => file.path === props.openFile))
  const lineCount = createMemo(() => props.fileContent ? props.fileContent.split("\n").length : 0)

  return <PageShell
    class="page-shell--ide"
    eyebrow="CODE WORKSPACE"
    title={props.openFile || props.projectName || "Workspace"}
    subtitle={props.workspace || "Choose a project to browse files"}
    search={{ value: props.fileSearch, placeholder: "Filter files", onInput: props.onFileSearch, hidden: !props.files.length }}
    actions={<>
      <button class={mode() === "tree" ? "active" : ""} onClick={() => setMode("tree")} title="Tree view">Tree</button>
      <button class={mode() === "list" ? "active" : ""} onClick={() => setMode("list")} title="Flat list">List</button>
      <button onClick={() => props.onRefresh()}>Refresh</button>
      <button class="primary" disabled={!props.openFile} onClick={() => props.onSave()}>Save</button>
    </>}
  >
    <Show when={props.workspace} fallback={
      <PageEmpty mark="▤" title="Open a project" body="Workspace files stay attached to the selected project. Pick a folder to inspect and edit source without leaving Grok Build.">
        <button class="primary" onClick={() => props.onOpenProject()}>Open project</button>
      </PageEmpty>
    }>
      <div class="ide-split">
        <aside class="tree-pane">
          <div class="tree-pane__meta">{props.files.length} file{props.files.length === 1 ? "" : "s"}</div>
          <Show when={props.files.length} fallback={
            <PageEmpty mark="▤" title="No files loaded" body="Refresh to walk the selected workspace. Heavy folders like node_modules stay hidden.">
              <button onClick={() => props.onRefresh()}>Load files</button>
            </PageEmpty>
          }>
            <Show when={rows().length} fallback={<p class="tree-pane__hint">No files match this filter.</p>}>
              <For each={rows()}>{(row) =>
                <button
                  class={`tree-row ${row.node.isDir ? "tree-row--dir" : ""} ${props.openFile === row.node.path ? "active" : ""}`}
                  style={{ "padding-left": `${10 + row.depth * 12}px` }}
                  title={row.node.path}
                  onClick={() => row.node.isDir ? toggleDir(row.node.id) : props.onSelectFile(row.node.path)}
                >
                  <i>{row.node.isDir ? (expanded().has(row.node.id) ? "▾" : "▸") : fileGlyph(row.node.name)}</i>
                  <span>{row.node.name}</span>
                </button>
              }</For>
            </Show>
          </Show>
        </aside>
        <div class="code-editor">
          <Show when={props.openFile} fallback={
            <PageEmpty mark="✎" title="Select a file" body="Choose a project file to inspect and edit. Changes save only inside this workspace. ⌘S writes the current buffer." />
          }>
            <textarea
              spellcheck={false}
              value={props.fileContent}
              onInput={(event) => props.onContentChange(event.currentTarget.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "s") {
                  event.preventDefault()
                  props.onSave()
                }
              }}
            />
            <span class="editor-status">
              {fileBasename(props.openFile)}
              {openMeta() ? ` · ${formatFileSize(openMeta()!.size)}` : ""}
              {` · ${lineCount()} lines`}
              {props.fileNotice ? ` · ${props.fileNotice}` : ""}
              {" · ⌘S to save"}
            </span>
          </Show>
        </div>
      </div>
    </Show>
  </PageShell>
}
