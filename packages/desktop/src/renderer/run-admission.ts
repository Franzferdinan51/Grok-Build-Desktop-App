export type RunAdmission = "start" | "queue"

/** Decide whether a prompt may start before awaiting any backend work. */
export function decideRunAdmission(localRunning: boolean, remoteRunning: boolean, starting: boolean): RunAdmission {
  return localRunning || remoteRunning || starting ? "queue" : "start"
}
