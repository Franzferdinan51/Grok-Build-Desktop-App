export type DesktopUpdatePhase =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "ready"
  | "up-to-date"
  | "unsupported"
  | "error"

export type DesktopUpdateReleaseInfo = {
  version: string
  releaseName?: string
  releaseNotes?: string
}

export type DesktopUpdateProgress = {
  percent: number
  transferred?: number
  total?: number
  bytesPerSecond?: number
}

export type DesktopUpdateState = {
  phase: DesktopUpdatePhase
  currentVersion: string
  availableVersion?: string
  releaseName?: string
  releaseNotes?: string
  percent?: number
  transferred?: number
  total?: number
  bytesPerSecond?: number
  checkedAt?: number
  error?: string
}

export function initialDesktopUpdateState(currentVersion: string): DesktopUpdateState {
  return { phase: "idle", currentVersion }
}

export function updateCheckingState(state: DesktopUpdateState): DesktopUpdateState {
  return {
    ...state,
    phase: "checking",
    error: undefined,
  }
}

export function updateAvailableState(state: DesktopUpdateState, info: DesktopUpdateReleaseInfo): DesktopUpdateState {
  return {
    ...state,
    phase: "available",
    availableVersion: info.version,
    releaseName: info.releaseName,
    releaseNotes: info.releaseNotes,
    percent: undefined,
    transferred: undefined,
    total: undefined,
    bytesPerSecond: undefined,
    error: undefined,
  }
}

export function updateNotAvailableState(state: DesktopUpdateState, info: Pick<DesktopUpdateReleaseInfo, "version">, checkedAt = Date.now()): DesktopUpdateState {
  return {
    phase: "up-to-date",
    currentVersion: state.currentVersion,
    checkedAt,
    availableVersion: info.version === state.currentVersion ? undefined : info.version,
  }
}

export function downloadProgressState(state: DesktopUpdateState, progress: DesktopUpdateProgress): DesktopUpdateState {
  const percent = Math.max(0, Math.min(100, Number.isFinite(progress.percent) ? progress.percent : 0))
  return {
    ...state,
    phase: "downloading",
    percent,
    transferred: progress.transferred,
    total: progress.total,
    bytesPerSecond: progress.bytesPerSecond,
    error: undefined,
  }
}

export function updateReadyState(state: DesktopUpdateState, info: Pick<DesktopUpdateReleaseInfo, "version">): DesktopUpdateState {
  return {
    ...state,
    phase: "ready",
    availableVersion: info.version,
    percent: 100,
    error: undefined,
  }
}

export function updateUnsupportedState(state: DesktopUpdateState, reason: string): DesktopUpdateState {
  return {
    phase: "unsupported",
    currentVersion: state.currentVersion,
    error: reason,
  }
}

export function updateErrorState(state: DesktopUpdateState, error: unknown, checkedAt = Date.now()): DesktopUpdateState {
  return {
    ...state,
    phase: "error",
    checkedAt,
    error: error instanceof Error ? error.message : String(error),
  }
}
