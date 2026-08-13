import { createEffect, createSignal, For, onCleanup, onMount, Show } from "solid-js"
import type { TaskLog } from "./chat-utils"
import type { GrokRunRecord } from "../preload"
import { addWorkspaceTask, parseWorkspaceTasks, removeWorkspaceTask, toggleWorkspaceTask, type WorkspaceTask } from "./workspace-tasks"
import { activityTone, normalizeRunPhase, runActivityFor, type RunActivity } from "./run-activity"

type Goal = { objective: string; status: "active" | "paused" | "completed"; iterations: number }

const runDuration = (run: GrokRunRecord) => {
  const elapsed = run.latencyMs ?? (run.finishedAt ? run.finishedAt - run.startedAt : undefined)
  return elapsed === undefined ? "in progress" : `${(elapsed / 1000).toFixed(1)}s`
}

export function TaskInspector(props: { running: boolean; events: TaskLog[]; goal: Goal | null; queuedCount: number; model: string; workspace: string; approvalMode: string; runs: GrokRunRecord[]; onStop: () => void; onOpenRuns: () => void }) {
  let taskDraft = ""
  const [tasks, setTasks] = createSignal<WorkspaceTask[]>([])
  const [activity, setActivity] = createSignal<RunActivity | null>(null)
  const currentActivity = () => activity() || (props.running ? runActivityFor("executing") : null)
  const persistTasks = async (next: WorkspaceTask[]) => { setTasks(next); if (props.workspace) await window.api.store.set(`workspace.tasks.${encodeURIComponent(props.workspace)}`, next) }
  createEffect(() => { const root = props.workspace; if (root) void window.api.store.get<unknown>(`workspace.tasks.${encodeURIComponent(root)}`).then((value) => setTasks(parseWorkspaceTasks(value))) })
  onMount(() => {
    const unsubscribe = window.api.backend.onEvent((event) => {
      const phase = normalizeRunPhase(event.phase)
      if (phase) setActivity(runActivityFor(phase, event.data))
    })
    onCleanup(unsubscribe)
  })
  const visibleEvents = () => props.events.filter((event) => event.kind !== "thought").slice(-6).reverse()
  return <aside class="task-inspector" aria-label="Task inspector">
    <header><div><strong>Task inspector</strong><span>{props.running ? "Live session" : "Ready for a task"}</span></div><button onClick={props.onStop} disabled={!props.running} class="task-inspector__stop">Stop</button></header>
    <section class="task-inspector__summary"><div class={`task-inspector__state task-inspector__state--${props.running ? "running" : "idle"}`}><i />{props.running ? "Running" : "Idle"}</div><dl><div><dt>Model</dt><dd>{props.model || "Default"}</dd></div><div><dt>Workspace</dt><dd title={props.workspace}>{props.workspace ? props.workspace.split(/[\\/]/).filter(Boolean).pop() : "Scratch"}</dd></div><div><dt>Approval</dt><dd>{props.approvalMode}</dd></div><div><dt>Queued</dt><dd>{props.queuedCount}</dd></div></dl></section>
    <Show when={currentActivity()}>{(current) => <section class={`task-inspector__phase task-inspector__phase--${activityTone(current().phase)}`}><div><i /> <strong>{current().label}</strong></div><small>{current().detail || "Waiting for the next verified backend update…"}</small></section>}</Show>
    <Show when={props.goal}><section class="task-inspector__section"><div class="task-inspector__section-title"><span>Goal</span><b>{props.goal?.status}</b></div><p>{props.goal?.objective}</p><small>{props.goal?.iterations} progress run{props.goal?.iterations === 1 ? "" : "s"}</small></section></Show>
    <section class="task-inspector__section task-inspector__checklist"><div class="task-inspector__section-title"><span>Workspace checklist</span><small>{tasks().filter((task) => task.status === "completed").length}/{tasks().length}</small></div><form onSubmit={(event) => { event.preventDefault(); void persistTasks(addWorkspaceTask(tasks(), taskDraft)); taskDraft = ""; event.currentTarget.reset() }}><input aria-label="Add checklist item" placeholder="Add a task…" onInput={(event) => { taskDraft = event.currentTarget.value }} /><button type="submit" disabled={!taskDraft.trim()}>+</button></form><Show when={tasks().length} fallback={<div class="task-inspector__empty">Keep a short, durable checklist for this workspace.</div>}><For each={tasks()}>{(task) => <div class="task-inspector__check-item"><button class={`task-inspector__check-toggle ${task.status === "completed" ? "is-complete" : ""}`} onClick={() => void persistTasks(toggleWorkspaceTask(tasks(), task.id))} aria-label={task.status === "completed" ? `Reopen ${task.content}` : `Complete ${task.content}`}>{task.status === "completed" ? "✓" : "○"}</button><span class={task.status === "completed" ? "is-complete" : ""}>{task.content}</span><button class="task-inspector__check-remove" onClick={() => void persistTasks(removeWorkspaceTask(tasks(), task.id))} aria-label={`Remove ${task.content}`}>×</button></div>}</For></Show></section>
    <Show when={props.runs.length}><section class="task-inspector__section task-inspector__runs"><div class="task-inspector__section-title"><span>Recent runs</span><button onClick={props.onOpenRuns}>Open history</button></div><For each={props.runs.slice(0, 5)}>{(run) => <button class="task-inspector__run" onClick={props.onOpenRuns}><i class={`task-inspector__run-dot task-inspector__run-dot--${run.status}`} /><span><strong>{run.prompt}</strong><small>{run.cwd.split(/[\\/]/).filter(Boolean).pop() || "Scratch"} · {runDuration(run)}</small></span><b>{run.status}</b></button>}</For></section></Show>
    <section class="task-inspector__section task-inspector__activity"><div class="task-inspector__section-title"><span>Live activity</span><small>{props.events.length ? `${props.events.length} events` : "No events yet"}</small></div><Show when={visibleEvents().length} fallback={<div class="task-inspector__empty">Streamed Grok activity will appear here while a task runs.</div>}><For each={visibleEvents()}>{(event) => <div class={`task-inspector__event task-inspector__event--${event.kind}`}><i /> <span>{event.content}</span></div>}</For></Show></section>
    <footer>Grok Build owns execution · checklist stays in this workspace</footer>
  </aside>
}
