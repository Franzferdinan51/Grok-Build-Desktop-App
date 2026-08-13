import { For, Show, createEffect, createMemo, createSignal } from "solid-js"
import { countDiffLines, defaultReviewExpanded, diffLineKind, reviewKind, reviewStatusLabel, summarizeReview, visibleReviewRows } from "../review-tree"
import { PageEmpty, PageShell } from "./PageShell"
import { UI_ICONS } from "../assets/ui-icons"

export function ReviewPanel(props: {
  workspace: string
  projectName: string
  branch?: string
  isGit?: boolean
  changes: { status: string; path: string; staged?: boolean }[]
  selectedPath: string
  diff: string
  onRefresh: () => void
  onSelect: (path: string) => void
  onAction: (path: string, action: "stage" | "unstage" | "discard") => void
  onAskReview: () => void
  onOpenProject: () => void
}) {
  const [query, setQuery] = createSignal("")
  const [mode, setMode] = createSignal<"tree" | "list">("tree")
  const [expanded, setExpanded] = createSignal<Set<string>>(new Set())

  createEffect(() => {
    setExpanded(new Set(defaultReviewExpanded(props.changes, query())))
  })

  const summary = createMemo(() => summarizeReview(props.changes))
  const rows = createMemo(() => visibleReviewRows(props.changes, query(), expanded(), mode()))
  const stats = createMemo(() => countDiffLines(props.diff))

  const toggleDir = (id: string) => {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return <PageShell
    class="page-shell--ide"
    eyebrow="GIT REVIEW"
    title={props.branch || props.projectName || "Review"}
    subtitle={props.workspace ? `${summary().total} changed file${summary().total === 1 ? "" : "s"}` : "Choose a Git project"}
    search={{ value: query(), placeholder: "Filter changes", onInput: setQuery, hidden: !props.changes.length }}
    actions={<>
      <button class={mode() === "tree" ? "active" : ""} onClick={() => setMode("tree")}>Tree</button>
      <button class={mode() === "list" ? "active" : ""} onClick={() => setMode("list")}>List</button>
      <button onClick={() => props.onRefresh()}>Refresh</button>
      <button class="primary" disabled={!props.workspace} onClick={() => props.onAskReview()}>Ask Grok</button>
    </>}
  >
    <Show when={props.workspace} fallback={
      <PageEmpty mark="⌘" icon={UI_ICONS.review} title="No project selected" body="Review shows porcelain Git status and per-file diffs for the selected workspace.">
        <button class="primary" onClick={() => props.onOpenProject()}>Open project</button>
      </PageEmpty>
    }>
      <div class="ide-split">
        <aside class="tree-pane">
          <div class="review-summary">
            <span>{summary().total} files</span>
            <Show when={summary().modified}><b class="review-chip review-chip--modified">{summary().modified} M</b></Show>
            <Show when={summary().added}><b class="review-chip review-chip--added">{summary().added} A</b></Show>
            <Show when={summary().deleted}><b class="review-chip review-chip--deleted">{summary().deleted} D</b></Show>
            <Show when={summary().untracked}><b class="review-chip review-chip--untracked">{summary().untracked} U</b></Show>
            <Show when={summary().renamed}><b class="review-chip">{summary().renamed} R</b></Show>
          </div>
          <Show when={props.changes.length} fallback={
            <PageEmpty
              mark="⌘"
              icon={UI_ICONS.review}
              title={props.isGit === false ? "Not a Git repository" : "Working tree clean"}
              body={props.isGit === false ? "Open a Git project to review diffs here." : "No uncommitted changes. Refresh after Grok Build edits files."}
            >
              <button onClick={() => props.onRefresh()}>Refresh changes</button>
            </PageEmpty>
          }>
            <Show when={rows().length} fallback={<p class="tree-pane__hint">No changes match this filter.</p>}>
              <For each={rows()}>{(row) =>
                <div
                  role="button"
                  tabIndex={0}
                  class={`tree-row ${row.node.isDir ? "tree-row--dir" : `tree-row--${row.node.data ? reviewKind(row.node.data.status) : "other"}`} ${props.selectedPath === row.node.path ? "active" : ""}`}
                  style={{ "padding-left": `${10 + row.depth * 12}px` }}
                  title={row.node.path}
                  onClick={() => row.node.isDir ? toggleDir(row.node.id) : props.onSelect(row.node.path)}
                  onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.currentTarget.click() } }}
                >
                  <i>{row.node.isDir ? (expanded().has(row.node.id) ? "▾" : "▸") : reviewStatusLabel(row.node.data?.status || "")}</i>
                  <span>{row.node.name}</span>
                  <Show when={!row.node.isDir && row.node.data}><small class="tree-row__actions"><button onClick={(event) => { event.stopPropagation(); props.onAction(row.node.path, row.node.data?.staged ? "unstage" : "stage") }}>{row.node.data?.staged ? "Unstage" : "Stage"}</button><Show when={row.node.data?.status !== "??"}><button class="tree-row__discard" onClick={(event) => { event.stopPropagation(); if (window.confirm(`Discard changes in ${row.node.path}? This cannot be undone.`)) props.onAction(row.node.path, "discard") }}>Discard</button></Show></small></Show>
                </div>
              }</For>
            </Show>
          </Show>
        </aside>
        <div class="code-editor">
          <Show when={props.selectedPath} fallback={
            <PageEmpty mark="±" icon={UI_ICONS.review} title="Select a changed file" body="Pick a path to read its diff. Ask Grok to review the current working tree from this tab." />
          }>
            <div class="diff-meta">
              <strong>{props.selectedPath}</strong>
              <span>+{stats().added} / −{stats().removed}</span>
            </div>
            <pre class="diff-view"><For each={props.diff.split("\n")}>{(line) =>
              <span class={`diff-line diff-line--${diffLineKind(line)}`}>{line || " "}\n</span>
            }</For></pre>
          </Show>
        </div>
      </div>
    </Show>
  </PageShell>
}
