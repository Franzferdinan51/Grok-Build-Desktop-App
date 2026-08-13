import type { GrokRunRecord } from "../preload"

export function runDurationLabel(run: GrokRunRecord, now = Date.now()): string {
  const elapsed = run.latencyMs ?? ((run.finishedAt ?? now) - run.startedAt)
  return `${Math.max(0, elapsed / 1000).toFixed(1)}s`
}

export function canResumeRun(run: GrokRunRecord): boolean {
  return Boolean(run.threadId && run.grokSessionId && run.status !== "running")
}

export function runDiagnostics(run: GrokRunRecord): string {
  return [
    `Status: ${run.status}`,
    `Prompt: ${run.prompt}`,
    `Workspace: ${run.cwd}`,
    `Model: ${run.model || "default"}`,
    `Session: ${run.grokSessionId || "none"}`,
    `Started: ${new Date(run.startedAt).toISOString()}`,
    `Finished: ${run.finishedAt ? new Date(run.finishedAt).toISOString() : "still running"}`,
    `Duration: ${runDurationLabel(run)}`,
    run.eventTail?.length ? `Last known activity events: ${run.eventTail.length}` : "",
    run.error ? `Error: ${run.error}` : "",
    run.errorClass ? `Error class: ${run.errorClass}` : "",
  ].filter(Boolean).join("\n")
}
