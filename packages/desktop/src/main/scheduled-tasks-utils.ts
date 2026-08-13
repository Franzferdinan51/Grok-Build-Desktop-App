import type { ScheduledGrokTask } from "./store"

/**
 * Pure helpers for the scheduler. Kept in a separate file (no Electron /
 * electron-store imports) so the smoke harness can exercise the exact
 * shipped transformation without bootstrapping the desktop runtime.
 */

/**
 * Bump a task's `nextRunAt` without flipping its `enabled` state.
 *
 * Previously `runScheduleNow` also set `enabled: true`, which silently
 * discarded the user's "Pause" intent when they triggered "Run now" on a
 * paused schedule. After a manual run the post-run `finish()` then reset
 * `enabled` from `repeatMinutes`, so paused one-time tasks silently became
 * paused again on the next tick, but paused repeat tasks with `repeatMinutes`
 * configured would be re-enabled for one tick before the next user pause
 * kicked in. The patch now only touches `nextRunAt` — the user-visible
 * enabled flag stays whatever the user set.
 */
export function withRunNowPatch(task: ScheduledGrokTask, at: number): ScheduledGrokTask {
  return { ...task, nextRunAt: at }
}

/**
 * Apply the post-run `finish()` patch used by `GrokTaskScheduler.finish`
 * here in pure form so it can be exercised from the smoke harness. Sets
 * `lastRunAt`/`lastStatus`, toggles `enabled` to track whether the task
 * should keep firing, and advances `nextRunAt` for repeat tasks.
 */
export function withScheduleFinishPatch(
  task: ScheduledGrokTask,
  status: "completed" | "failed",
  at: number = Date.now(),
  threadId?: string,
  runId?: string,
): ScheduledGrokTask {
  const repeat = task.repeatMinutes && task.repeatMinutes > 0
  return {
    ...task,
    lastRunAt: at,
    lastStatus: status,
    enabled: Boolean(repeat),
    nextRunAt: repeat ? at + (task.repeatMinutes as number) * 60_000 : task.nextRunAt,
    lastThreadId: threadId ?? task.lastThreadId,
    lastRunId: runId ?? task.lastRunId,
  }
}

export function withScheduleRunningPatch(task: ScheduledGrokTask, running: boolean, detail?: string): ScheduledGrokTask {
  return { ...task, running, lastError: running ? undefined : detail }
}
