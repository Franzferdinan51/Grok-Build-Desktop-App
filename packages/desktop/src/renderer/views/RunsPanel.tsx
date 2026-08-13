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
import { UI_ICONS } from "../assets/ui-icons"
import { canResumeRun, runDiagnostics, runDurationLabel } from "../run-detail"
import "../runs-panel.css"

export type RunsPanelProps = {
  runs: () => GrokRunRecord[]
  onRefresh: () => void
  onOpenConversation: (run: GrokRunRecord) => void
  onResume: (run: GrokRunRecord) => void
  onFork: (run: GrokRunRecord) => void
  onStop: (run: GrokRunRecord) => void
  onCopyDiagnostics: (run: GrokRunRecord) => void
}

export function RunsPanel(props: RunsPanelProps) {
  const [search, setSearch] = createSignal("")
  const [status, setStatus] = createSignal<"all" | "running" | "completed" | "failed" | "cancelled" | "interrupted">("all")
  const [selectedId, setSelectedId] = createSignal("")
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
      cancelled: runs.filter((run) => run.status === "cancelled").length,
      interrupted: runs.filter((run) => run.status === "interrupted").length,
    }
  })
  const selected = createMemo(() => visible().find((run) => run.id === selectedId()) || visible()[0])

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
      { id: "cancelled", label: "Cancelled", meta: counts().cancelled },
      { id: "interrupted", label: "Interrupted", meta: counts().interrupted },
    ]}
    activeTab={status()}
    onTab={(id) => setStatus(id as "all" | "running" | "completed" | "failed" | "cancelled" | "interrupted")}
    actions={<button onClick={() => void props.onRefresh()}>Refresh</button>}
  >
    <Show when={props.runs().length} fallback={
      <PageEmpty mark="◴" icon={UI_ICONS.runs} title="No runs yet" body="Pick a project and start a Grok Build task. Completed work shows up here with session and usage details." />
    }>
      <Show when={visible().length} fallback={<PageEmpty mark="◴" icon={UI_ICONS.runs} title="No matching runs" body="Try another search or status filter." />}>
        <div class="runs-layout">
        <div class="list-stack runs-list">
          <For each={visible()}>{(run) =>
            <button class={`list-row runs-list__row ${selected()?.id === run.id ? "is-selected" : ""}`} onClick={() => setSelectedId(run.id)}>
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
                </span>
              </div>
              <i class={`status-pill status-pill--${run.status}`}>{run.status === "interrupted" ? "outcome unknown" : run.status}</i>
            </button>
          }</For>
        </div>
        <Show when={selected()}>{(run) => <aside class="run-detail" aria-label="Selected run details">
          <header><div><span class="eyebrow">RUN INSPECTOR</span><strong>{run().status === "running" ? "Active Grok Build task" : run().status === "interrupted" ? "Interrupted task · outcome unknown" : "Run details"}</strong></div><i class={`status-pill status-pill--${run().status}`}>{run().status === "interrupted" ? "outcome unknown" : run().status}</i></header>
          <section class="run-detail__prompt"><span>Instruction</span><p>{run().prompt}</p></section>
          <dl><div><dt>Workspace</dt><dd title={run().cwd}>{run().cwd}</dd></div><div><dt>Model</dt><dd>{run().model || "Default"}</dd></div><div><dt>Session</dt><dd>{run().grokSessionId || "No native session"}</dd></div><div><dt>Duration</dt><dd>{runDurationLabel(run())}</dd></div><Show when={run().tokensIn !== undefined}><div><dt>Input tokens</dt><dd>{run().tokensIn?.toLocaleString()}</dd></div></Show><Show when={run().tokensOut !== undefined}><div><dt>Output tokens</dt><dd>{run().tokensOut?.toLocaleString()}</dd></div></Show></dl>
          <Show when={run().error}><section class="run-detail__error"><span>Error</span><p>{run().error}</p><Show when={run().errorClass}><small>{run().errorClass}</small></Show></section></Show>
          <Show when={run().eventTail?.length}><section class="run-detail__tail"><span>Last known activity</span><For each={run().eventTail?.slice(-8)}>{(event) => <p><b>{event.phase || event.type}</b>{event.data || event.message || event.sessionId ? ` · ${event.data || event.message || `session ${event.sessionId}`}` : ""}</p>}</For></section></Show>
          <div class="run-detail__actions"><Show when={run().threadId}><button onClick={() => props.onOpenConversation(run())}>Open conversation</button></Show><button disabled={!canResumeRun(run())} onClick={() => props.onResume(run())}>Resume session</button><button disabled={!run().threadId} onClick={() => props.onFork(run())}>Fork and continue</button><Show when={run().status === "running"}><button class="danger" onClick={() => props.onStop(run())}>Stop</button></Show><button onClick={() => props.onCopyDiagnostics(run())}>Copy diagnostics</button></div>
          <pre class="run-detail__diagnostics">{runDiagnostics(run())}</pre>
        </aside>}</Show>
        </div>
      </Show>
    </Show>
  </PageShell>
}
