/**
 * views/RunsPanel.tsx — Grok Build run history view.
 *
 * Extracted from `App.tsx` as a focused component. Takes the runs list and
 * a refresh hook as inputs so the parent can hoist state without duplicating
 * it inside every view.
 */

import { For, Show, createMemo, createSignal } from "solid-js"
import type { GrokRunRecord } from "../../preload/index"
import { PageEmpty, PageShell } from "./PageShell"

export type RunsPanelProps = {
  runs: () => GrokRunRecord[]
  onRefresh: () => void
}

export function RunsPanel(props: RunsPanelProps) {
  const [search, setSearch] = createSignal("")
  const [status, setStatus] = createSignal<"all" | "running" | "completed" | "failed">("all")
  const visible = createMemo(() => {
    const needle = search().trim().toLowerCase()
    return props.runs().filter((run) => {
      if (status() !== "all" && run.status !== status()) return false
      return `${run.prompt} ${run.cwd} ${run.grokSessionId || ""} ${run.model || ""}`.toLowerCase().includes(needle)
    })
  })
  const counts = createMemo(() => {
    const runs = props.runs()
    return {
      all: runs.length,
      running: runs.filter((run) => run.status === "running").length,
      completed: runs.filter((run) => run.status === "completed").length,
      failed: runs.filter((run) => run.status === "failed").length,
    }
  })

  return <PageShell
    class="page-shell--page"
    eyebrow="GROK BUILD RUN HISTORY"
    title="Every coding task is a Grok Build run"
    subtitle="Prompts, projects, sessions, and token usage from this desktop."
    search={{ value: search(), placeholder: "Search prompts, projects, sessions", onInput: setSearch, hidden: !props.runs().length }}
    tabs={[
      { id: "all", label: "All", meta: counts().all },
      { id: "running", label: "Running", meta: counts().running },
      { id: "completed", label: "Completed", meta: counts().completed },
      { id: "failed", label: "Failed", meta: counts().failed },
    ]}
    activeTab={status()}
    onTab={(id) => setStatus(id as "all" | "running" | "completed" | "failed")}
    actions={<button onClick={() => void props.onRefresh()}>Refresh</button>}
  >
    <Show when={props.runs().length} fallback={
      <PageEmpty mark="◴" title="No runs yet" body="Pick a project and start a Grok Build task. Completed work shows up here with session and usage details." />
    }>
      <Show when={visible().length} fallback={<PageEmpty mark="◴" title="No matching runs" body="Try another search or status filter." />}>
        <div class="list-stack">
          <For each={visible()}>{(run) =>
            <article class="list-row list-row--static">
              <div>
                <strong>{run.prompt}</strong>
                <span>
                  {run.cwd}
                  {run.model ? ` · ${run.model}` : ""}
                  {run.grokSessionId ? ` · session ${run.grokSessionId}` : ""}
                  {run.latencyMs !== undefined ? ` · ${(run.latencyMs / 1000).toFixed(1)}s` : ""}
                  {run.tokensIn !== undefined ? ` · in ${run.tokensIn.toLocaleString()}` : ""}
                  {run.tokensOut !== undefined ? ` · out ${run.tokensOut.toLocaleString()}` : ""}
                  {run.costUsd !== undefined ? ` · $${run.costUsd.toFixed(4)}` : ""}
                  {run.advisorCount ? ` · advisors ${run.advisorCount}${run.advisorFailures ? ` (${run.advisorFailures} failed)` : ""}` : ""}
                  {run.errorClass ? ` · ${run.errorClass}` : ""}
                  {run.error ? ` · ${run.error}` : ""}
                </span>
              </div>
              <i class={`status-pill status-pill--${run.status}`}>{run.status}</i>
            </article>
          }</For>
        </div>
      </Show>
    </Show>
  </PageShell>
}
