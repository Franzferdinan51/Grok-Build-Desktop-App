import { For, Show, createMemo, createSignal } from "solid-js"
import type { ScheduledGrokTask } from "../../preload"
import { filterSchedules, formatRepeat, scheduleState } from "../page-lists"
import { PageEmpty, PageShell } from "./PageShell"
import { UI_ICONS } from "../assets/ui-icons"

export function ScheduledPanel(props: {
  schedules: ScheduledGrokTask[]
  name: string
  at: string
  prompt: string
  repeatMinutes: number
  workspace: string
  onName: (value: string) => void
  onAt: (value: string) => void
  onPrompt: (value: string) => void
  onRepeat: (value: number) => void
  onCreate: () => void
  onRun: (id: string) => void
  onOpenResult: (task: ScheduledGrokTask) => void
  onToggle: (id: string, enabled: boolean) => void
  onRemove: (id: string) => void
}) {
  const [query, setQuery] = createSignal("")
  const [selected, setSelected] = createSignal("")
  const [composing, setComposing] = createSignal(false)
  const visible = createMemo(() => filterSchedules(props.schedules, query()))
  const active = createMemo(() => visible().find((task) => task.id === selected()) || visible()[0])
  const canCreate = createMemo(() => Boolean(props.name.trim() && props.prompt.trim() && props.workspace && props.at))

  return <PageShell
    class="page-shell--page"
    eyebrow="GROK BUILD SCHEDULES"
    title="Run coding tasks on a schedule"
    subtitle="Schedules execute through Grok Build while the desktop app is running."
    search={{ value: query(), placeholder: "Search schedules", onInput: setQuery, hidden: !props.schedules.length }}
    actions={<button class="primary" onClick={() => setComposing(true)}>New schedule</button>}
  >
    <Show when={props.schedules.length || composing()} fallback={
      <PageEmpty mark="◷" icon={UI_ICONS.scheduled} title="No scheduled work" body="Create a one-shot or repeating Grok Build task. The selected workspace is the working directory.">
        <button class="primary" onClick={() => setComposing(true)}>New schedule</button>
      </PageEmpty>
    }>
      <div class="master-detail">
        <aside class="list-column">
          <For each={visible()} fallback={<p class="tree-pane__hint">No schedules match this filter.</p>}>{(task) =>
            <button class={`list-row ${active()?.id === task.id && !composing() ? "active" : ""}`} onClick={() => { setSelected(task.id); setComposing(false) }}>
              <strong>{task.name}</strong>
              <span>{new Date(task.nextRunAt).toLocaleString()} · {formatRepeat(task.repeatMinutes)}</span>
              <i class={`status-pill status-pill--${scheduleState(task)}`}>{scheduleState(task)}</i>
            </button>
          }</For>
        </aside>
        <Show when={composing() || !active()} fallback={
          <Show when={active()}>{(task) =>
            <article class="detail-column">
              <header>
                <i class={`status-pill status-pill--${scheduleState(task())}`}>{scheduleState(task())}</i>
                <h2>{task().name}</h2>
                <p>{task().prompt}</p>
              </header>
              <dl class="detail-meta">
                <div><dt>Next run</dt><dd>{new Date(task().nextRunAt).toLocaleString()}</dd></div>
                <div><dt>Repeat</dt><dd>{formatRepeat(task().repeatMinutes)}</dd></div>
                <div><dt>Workspace</dt><dd>{task().cwd}</dd></div>
                <Show when={task().model}><div><dt>Model</dt><dd>{task().model}</dd></div></Show>
                <Show when={task().lastStatus || task().lastError}><div><dt>Last run</dt><dd>{task().lastStatus || "failed"}{task().lastRunAt ? ` · ${new Date(task().lastRunAt!).toLocaleString()}` : ""}{task().lastError ? ` · ${task().lastError}` : ""}</dd></div></Show>
              </dl>
              <div class="detail-actions">
                <button class="primary" onClick={() => props.onRun(task().id)}>Run now</button>
                <button disabled={!task().lastThreadId} onClick={() => props.onOpenResult(task())}>Open last result</button>
                <button onClick={() => props.onToggle(task().id, !task().enabled)}>{task().enabled ? "Pause" : "Enable"}</button>
                <button onClick={() => props.onRemove(task().id)}>Delete</button>
              </div>
            </article>
          }</Show>
        }>
          <article class="detail-column">
            <header>
              <span class="eyebrow">NEW SCHEDULE</span>
              <h2>Queue a Grok Build run</h2>
              <p>{props.workspace ? "Uses the currently selected workspace." : "Select a project before creating a schedule."}</p>
            </header>
            <div class="form-stack">
              <label>Name<input value={props.name} onInput={(event) => props.onName(event.currentTarget.value)} placeholder="Task name" /></label>
              <label>When<input type="datetime-local" value={props.at} onInput={(event) => props.onAt(event.currentTarget.value)} /></label>
              <label>Repeat minutes<input type="number" min="0" value={props.repeatMinutes} onInput={(event) => props.onRepeat(Number(event.currentTarget.value))} placeholder="0 for once" /></label>
              <label>Prompt<textarea value={props.prompt} onInput={(event) => props.onPrompt(event.currentTarget.value)} placeholder="Coding task prompt" /></label>
            </div>
            <div class="detail-actions">
              <button class="primary" disabled={!canCreate()} onClick={() => { props.onCreate(); setComposing(false) }}>Create schedule</button>
              <Show when={props.schedules.length}><button onClick={() => setComposing(false)}>Cancel</button></Show>
            </div>
          </article>
        </Show>
      </div>
    </Show>
  </PageShell>
}
