import { For, Show, createMemo } from "solid-js"
import type { LocalStudioSnapshot } from "../../preload"
import { objectRows } from "../page-lists"
import { PageEmpty, PageShell } from "./PageShell"
import { UI_ICONS } from "../assets/ui-icons"

export function RuntimePanel(props: {
  url: string
  studio: LocalStudioSnapshot
  onUrl: (value: string) => void
  onSave: () => void
}) {
  const health = createMemo(() => objectRows(props.studio.health))
  const status = createMemo(() => objectRows(props.studio.status))
  const gpus = createMemo(() => Array.isArray(props.studio.gpus) ? props.studio.gpus : [])

  return <PageShell
    class="page-shell--page"
    eyebrow="LOCAL STUDIO CONTROLLER"
    title="Watch local inference"
    subtitle="Optional read-only connection for GPU and runtime status. Grok Build still powers coding; this never launches, evicts, downloads, or loads a model."
    actions={<button class="primary" onClick={() => props.onSave()}>Save + Refresh</button>}
  >
    <div class="form-inline">
      <input value={props.url} onInput={(event) => props.onUrl(event.currentTarget.value)} placeholder="http://127.0.0.1:8080" />
    </div>
    <Show when={props.studio.configured} fallback={
      <PageEmpty mark="▣" icon={UI_ICONS.runtime} title="No controller URL" body="Add a Local Studio URL to monitor health and GPUs. Model lifecycle stays user-controlled." />
    }>
      <div class={`runtime-banner ${props.studio.reachable ? "runtime-banner--ready" : "runtime-banner--error"}`}>
        {props.studio.reachable ? `Connected to ${props.studio.baseUrl}` : props.studio.error || "Unreachable"}
      </div>
      <Show when={props.studio.reachable}>
        <div class="runtime-grid">
          <Show when={health().length}>
            <section>
              <h3>Health</h3>
              <For each={health()}>{(row) => <div class="list-row list-row--static"><strong>{row.key}</strong><span>{row.value}</span></div>}</For>
            </section>
          </Show>
          <Show when={status().length}>
            <section>
              <h3>Status</h3>
              <For each={status()}>{(row) => <div class="list-row list-row--static"><strong>{row.key}</strong><span>{row.value}</span></div>}</For>
            </section>
          </Show>
        </div>
        <Show when={gpus().length}>
          <section class="runtime-gpus">
            <h3>GPUs</h3>
            <For each={gpus()}>{(gpu, index) =>
              <article class="list-row list-row--static">
                <strong>GPU {index() + 1}</strong>
                <span>{typeof gpu === "object" && gpu ? JSON.stringify(gpu) : String(gpu)}</span>
              </article>
            }</For>
          </section>
        </Show>
        <Show when={!health().length && !status().length && !gpus().length}>
          <pre class="log-view">{JSON.stringify({ health: props.studio.health, status: props.studio.status, gpus: props.studio.gpus }, null, 2)}</pre>
        </Show>
      </Show>
    </Show>
  </PageShell>
}
