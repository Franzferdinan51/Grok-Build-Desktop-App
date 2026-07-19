/**
 * views/RunsPanel.tsx — Grok Build run history view.
 *
 * Extracted from `App.tsx` as a focused component. Takes the runs list and
 * a search query accessor as inputs so the parent can hoist state without
 * duplicating it inside every view. The component remains a presentation
 * leaf: every action funnels back through the props the parent provides.
 */

import { For, Show, createSignal } from "solid-js"
import type { GrokRunRecord } from "../../preload/index"

export type RunsPanelProps = {
  runs: () => GrokRunRecord[]
  /** Fire-and-forget refresh hook: the panel does not consume the result. */
  onRefresh: () => void
}

export function RunsPanel(props: RunsPanelProps) {
  const [search, setSearch] = createSignal("")
  return <section class="runs-panel">
    <span class="eyebrow">GROK BUILD RUN HISTORY</span>
    <h1>Every coding task is a Grok Build run.</h1>
    <div class="token-row">
      <input value={search()} onInput={(e) => setSearch(e.currentTarget.value)} placeholder="Search prompts, projects, sessions" />
      <button onClick={() => void props.onRefresh()}>Refresh</button>
    </div>
    <Show when={props.runs().length > 0} fallback={<p>No runs yet. Pick a project and start a Grok Build task.</p>}>
      <For each={props.runs().filter((run) => `${run.prompt} ${run.cwd} ${run.grokSessionId || ""}`.toLowerCase().includes(search().toLowerCase()))}>
        {(run) => <article class="run-row">
          <div>
            <strong>{run.prompt}</strong>
            <span>{run.cwd}{run.model ? ` · ${run.model}` : ""}{run.grokSessionId ? ` · session ${run.grokSessionId}` : ""}{run.latencyMs !== undefined ? ` · ${(run.latencyMs / 1000).toFixed(1)}s` : ""}{run.tokensIn !== undefined ? ` · in ${run.tokensIn.toLocaleString()}` : ""}{run.tokensOut !== undefined ? ` · out ${run.tokensOut.toLocaleString()}` : ""}{run.costUsd !== undefined ? ` · $${run.costUsd.toFixed(4)}` : ""}{run.advisorCount ? ` · advisors ${run.advisorCount}${run.advisorFailures ? ` (${run.advisorFailures} failed)` : ""}` : ""}{run.errorClass ? ` · ${run.errorClass}` : ""}{run.error ? ` · ${run.error}` : ""}</span>
          </div>
          <div class={`run-status run-status--${run.status}`}>{run.status}</div>
        </article>}
      </For>
    </Show>
  </section>
}
