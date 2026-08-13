import { Show } from "solid-js"
import type { DuckbotMemoryStatus } from "../preload"
import { workbenchWorkspaceLabel } from "./workbench-statusbar-model"

export type WorkbenchStatusBarProps = {
  backendReady: boolean
  backendLabel: string
  workspace: string
  branch?: string
  changedFiles: number
  running: boolean
  queuedCount: number
  model: string
  approval: string
  memory: DuckbotMemoryStatus | null
  onWorkspace: () => void
  onReview: () => void
  onActivity: () => void
  onSettings: () => void
}

export function WorkbenchStatusBar(props: WorkbenchStatusBarProps) {
  const memoryLabel = () => !props.memory || !props.memory.enabled
    ? "Memory off"
    : props.memory.available ? "DuckBot memory" : "Memory unavailable"
  return <footer class="workbench-statusbar" aria-label="Workbench status" role="status">
    <div class="workbench-statusbar__group">
      <button class={`workbench-statusbar__item ${props.backendReady ? "is-ready" : "is-error"}`} onClick={props.onSettings} title={props.backendReady ? props.backendLabel : "Open runtime settings"}><i /> <span>{props.backendReady ? "Grok ready" : "Grok offline"}</span></button>
      <button class="workbench-statusbar__item" onClick={props.onWorkspace} title={props.workspace || "Choose a workspace"}><span>{workbenchWorkspaceLabel(props.workspace)}</span><Show when={props.branch}><small>⑂ {props.branch}</small></Show></button>
    </div>
    <div class="workbench-statusbar__group workbench-statusbar__group--right">
      <button class="workbench-statusbar__item" onClick={props.onActivity} title="Open task activity"><span>{props.running ? "Working" : "Idle"}</span><Show when={props.queuedCount}><small>{props.queuedCount} queued</small></Show></button>
      <button class="workbench-statusbar__item" onClick={props.onReview} title="Review workspace changes"><span>{props.changedFiles ? `${props.changedFiles} changed` : "Clean"}</span></button>
      <span class="workbench-statusbar__item workbench-statusbar__item--static" title={props.model || "Default model"}>◇ {props.model || "Default model"}</span>
      <span class="workbench-statusbar__item workbench-statusbar__item--static" title={`Approval: ${props.approval}`}>⚿ {props.approval}</span>
      <span class={`workbench-statusbar__item workbench-statusbar__item--static ${props.memory?.available ? "is-ready" : ""}`} title={props.memory?.error || memoryLabel()}>◈ {memoryLabel()}</span>
    </div>
  </footer>
}
