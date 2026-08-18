import { createEffect, createSignal, For, onCleanup, onMount, Show } from "solid-js"
import type { TaskLog } from "./chat-utils"
import type { GrokRunRecord } from "../preload"
import { addWorkspaceTask, parseWorkspaceTasks, removeWorkspaceTask, toggleWorkspaceTask, type WorkspaceTask } from "./workspace-tasks"
import { activityTone, normalizeRunPhase, runActivityFor, type RunActivity } from "./run-activity"
import { buildActivityTimeline } from "./activity-timeline"
import { reduceSubagentActivities, shouldResetSubagentsForRunTransition, subagentDuration, subagentPatchFromBackendEvent, subagentStatusLabel, type SubagentActivity } from "./subagent-activity"
import { compactLatency, compactTokenCount, summarizeRunMetrics } from "./run-metrics"

type Goal = { objective: string; status: "active" | "paused" | "completed"; iterations: number }

const runDuration = (run: GrokRunRecord) => {
  const elapsed = run.latencyMs ?? (run.finishedAt ? run.finishedAt - run.startedAt : undefined)
  return elapsed === undefined ? "in progress" : `${(elapsed / 1000).toFixed(1)}s`
}

export function TaskInspector(props: { running: boolean; events: TaskLog[]; goal: Goal | null; queuedCount: number; model: string; workspace: string; approvalMode: string; runs: GrokRunRecord[]; contextChars: number; contextBudgetChars: number; onStop: () => void; onOpenRuns: () => void }) {
  let taskDraft = ""
  let previousRunning = props.running
  const [tasks, setTasks] = createSignal<WorkspaceTask[]>([])
  const [activity, setActivity] = createSignal<RunActivity | null>(null)
  const [subagents, setSubagents] = createSignal<SubagentActivity[]>([])
  const currentActivity = () => activity() || (props.running ? runActivityFor("executing") : null)
  createEffect(() => {
    const running = props.running
    if (shouldResetSubagentsForRunTransition(previousRunning, running)) setSubagents([])
    previousRunning = running
  })
  const persistTasks = async (next: WorkspaceTask[]) => { setTasks(next); if (props.workspace) await window.api.store.set(`workspace.tasks.${encodeURIComponent(props.workspace)}`, next) }
  createEffect(() => { const root = props.workspace; if (root) void window.api.store.get<unknown>(`workspace.tasks.${encodeURIComponent(root)}`).then((value) => setTasks(parseWorkspaceTasks(value))) })
  onMount(() => {
    const unsubscribe = window.api.backend.onEvent((event) => {
      const phase = normalizeRunPhase(event.phase)
      if (phase) setActivity(runActivityFor(phase, event.data))
      const patch = subagentPatchFromBackendEvent(event)
      if (patch) setSubagents((current) => reduceSubagentActivities(current, patch))
    })
    void window.api.backend.activeRun().then((run) => {
      if (!run) return
      for (const event of run.events) {
        const patch = subagentPatchFromBackendEvent(event)
        if (patch) setSubagents((current) => reduceSubagentActivities(current, patch))
      }
    })
    onCleanup(unsubscribe)
  })
  const timeline = () => buildActivityTimeline(props.events)
  const metrics = () => summarizeRunMetrics(props.runs)
  const contextPercent = () => Math.min(100, Math.round((props.contextChars / Math.max(1, props.contextBudgetChars)) * 100))
  const contextTokens = () => Math.ceil(props.contextChars / 4)
  const contextBudgetTokens = () => Math.ceil(props.contextBudgetChars / 4)
  return <aside class="task-inspector" aria-label="Task inspector">
    <header><div><strong>Task inspector</strong><span>{props.running ? "Live session" : "Ready for a task"}</span></div><button onClick={props.onStop} disabled={!props.running} class="task-inspector__stop">Stop</button></header>
    <section class="task-inspector__summary"><div class={`task-inspector__state task-inspector__state--${props.running ? "running" : "idle"}`}><i />{props.running ? "Running" : "Idle"}</div><dl><div><dt>Model</dt><dd>{props.model || "Default"}</dd></div><div><dt>Workspace</dt><dd title={props.workspace}>{props.workspace ? props.workspace.split(/[\\/]/).filter(Boolean).pop() : "Scratch"}</dd></div><div><dt>Approval</dt><dd>{props.approvalMode}</dd></div><div><dt>Queued</dt><dd>{props.queuedCount}</dd></div></dl></section>
    <Show when={currentActivity()}>{(current) => <section class={`task-inspector__phase task-inspector__phase--${activityTone(current().phase)}`}><div><i /> <strong>{current().label}</strong></div><small>{current().detail || "Waiting for the next verified backend update…"}</small></section>}</Show>
    <Show when={subagents().length}><section class="task-inspector__section task-inspector__subagents"><div class="task-inspector__section-title"><span>Subagents</span><small>{props.running ? `${subagents().filter((entry) => entry.status === "running").length} active` : "last run"}</small></div><For each={subagents()}>{(entry) => <div class={`task-inspector__subagent task-inspector__subagent--${entry.status}`}><i /><span><strong>{entry.label}</strong><small>{subagentStatusLabel(entry.status)} · {subagentDuration(entry)}{entry.toolCalls ? ` · ${entry.toolCalls} tools` : ""}{entry.turns ? ` · ${entry.turns} turn${entry.turns === 1 ? "" : "s"}` : ""}</small></span></div>}</For></section></Show>
    <Show when={props.goal}><section class="task-inspector__section"><div class="task-inspector__section-title"><span>Goal</span><b>{props.goal?.status}</b></div><p>{props.goal?.objective}</p><small>{props.goal?.iterations} progress run{props.goal?.iterations === 1 ? "" : "s"}</small></section></Show>
    <section class="task-inspector__section task-inspector__checklist"><div class="task-inspector__section-title"><span>Workspace checklist</span><small>{tasks().filter((task) => task.status === "completed").length}/{tasks().length}</small></div><form onSubmit={(event) => { event.preventDefault(); void persistTasks(addWorkspaceTask(tasks(), taskDraft)); taskDraft = ""; event.currentTarget.reset() }}><input aria-label="Add checklist item" placeholder="Add a task…" onInput={(event) => { taskDraft = event.currentTarget.value }} /><button type="submit" disabled={!taskDraft.trim()}>+</button></form><Show when={tasks().length} fallback={<div class="task-inspector__empty">Keep a short, durable checklist for this workspace.</div>}><For each={tasks()}>{(task) => <div class="task-inspector__check-item"><button class={`task-inspector__check-toggle ${task.status === "completed" ? "is-complete" : ""}`} onClick={() => void persistTasks(toggleWorkspaceTask(tasks(), task.id))} aria-label={task.status === "completed" ? `Reopen ${task.content}` : `Complete ${task.content}`}>{task.status === "completed" ? "✓" : "○"}</button><span class={task.status === "completed" ? "is-complete" : ""}>{task.content}</span><button class="task-inspector__check-remove" onClick={() => void persistTasks(removeWorkspaceTask(tasks(), task.id))} aria-label={`Remove ${task.content}`}>×</button></div>}</For></Show></section>
    <Show when={props.runs.length}><section class="task-inspector__section task-inspector__runs"><div class="task-inspector__section-title"><span>Recent runs</span><button onClick={props.onOpenRuns}>Open history</button></div><For each={props.runs.slice(0, 5)}>{(run) => <button class="task-inspector__run" onClick={props.onOpenRuns}><i class={`task-inspector__run-dot task-inspector__run-dot--${run.status}`} /><span><strong>{run.prompt}</strong><small>{run.cwd.split(/[\\/]/).filter(Boolean).pop() || "Scratch"} · {runDuration(run)}</small></span><b>{run.status}</b></button>}</For></section></Show>
    <Show when={metrics().runs}><section class="task-inspector__section task-inspector__metrics"><div class="task-inspector__section-title"><span>Performance</span><small>last {metrics().runs} runs</small></div><dl><div><dt>Input</dt><dd>{compactTokenCount(metrics().inputTokens)} tokens</dd></div><div><dt>Output</dt><dd>{compactTokenCount(metrics().outputTokens)} tokens</dd></div><div><dt>Latency</dt><dd>{compactLatency(metrics().averageLatencyMs)}</dd></div><Show when={metrics().latestCostUsd !== undefined}><div><dt>Latest cost</dt><dd>${metrics().latestCostUsd!.toFixed(4)}</dd></div></Show></dl><small class="task-inspector__metrics-note">Provider usage is shown only when Grok reports it.</small></section></Show>
    <section class="task-inspector__section task-inspector__context"><div class="task-inspector__section-title"><span>Prepared context</span><small>bounded app budget</small></div><div class="task-inspector__context-label"><strong>~{compactTokenCount(contextTokens())} tokens</strong><span>of ~{compactTokenCount(contextBudgetTokens())}</span></div><div class="task-inspector__context-bar"><i style={{ width: `${contextPercent()}%` }} /></div><small class="task-inspector__metrics-note">Estimate from visible text; private reasoning and tool noise are excluded before the next turn.</small></section>
    <section class="task-inspector__section task-inspector__activity"><div class="task-inspector__section-title"><span>Activity timeline</span><small>{props.events.length ? `${props.events.length} events` : "No events yet"}</small></div><Show when={timeline().length} fallback={<div class="task-inspector__empty">Structured Grok activity will appear here while a task runs.</div>}><div class="task-inspector__timeline"><For each={timeline()}>{(entry) => <details class={`task-inspector__timeline-entry task-inspector__timeline-entry--${entry.kind}`}><summary><i /><span><strong>{entry.label}</strong><small>{entry.count > 1 ? `${entry.count} repeated updates` : "Latest update"}</small></span></summary><p>{entry.detail}</p></details>}</For></div></Show></section>
    <footer>Grok Build owns execution · checklist stays in this workspace</footer>
  </aside>
}
