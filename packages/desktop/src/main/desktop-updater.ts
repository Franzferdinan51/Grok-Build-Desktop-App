import { app } from "electron"
import electronUpdater, { type AppUpdater, type ProgressInfo, type UpdateInfo } from "electron-updater"
import {
  downloadProgressState,
  initialDesktopUpdateState,
  updateAvailableState,
  updateCheckingState,
  updateErrorState,
  updateNotAvailableState,
  updateReadyState,
  updateUnsupportedState,
  type DesktopUpdateState,
} from "./desktop-update-state"

const { autoUpdater } = electronUpdater

const DEFAULT_AUTO_CHECK_DELAY_MS = 30_000
export const DESKTOP_UPDATE_CHECK_COOLDOWN_MS = 4 * 60 * 60 * 1000

export type DesktopUpdaterOptions = {
  hasActiveWork: () => boolean
  emit: (state: DesktopUpdateState) => void
  log?: (level: "info" | "warn" | "error", message: string) => void
  updater?: AppUpdater
  now?: () => number
  isPackaged?: () => boolean
  currentVersion?: () => string
  autoCheckDelayMs?: number
}

type CheckOptions = { manual?: boolean }

function cleanText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const text = value.trim()
  return text || undefined
}

export function desktopReleaseNotesText(notes: UpdateInfo["releaseNotes"]): string | undefined {
  if (typeof notes === "string") return cleanText(notes)
  if (!Array.isArray(notes)) return undefined

  const sections = notes.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return []
    const row = entry as { version?: unknown; note?: unknown }
    const note = cleanText(row.note)
    if (!note) return []
    const version = cleanText(row.version)
    return [version ? `${version}\n${note}` : note]
  })
  return sections.length ? sections.join("\n\n") : undefined
}

export function shouldRunAutomaticDesktopUpdateCheck(lastCheckAt: number, now: number, cooldownMs = DESKTOP_UPDATE_CHECK_COOLDOWN_MS): boolean {
  return lastCheckAt <= 0 || now - lastCheckAt >= cooldownMs
}

export class DesktopUpdater {
  private readonly updater: AppUpdater
  private readonly now: () => number
  private readonly isPackaged: () => boolean
  private readonly currentVersion: () => string
  private readonly hasActiveWork: () => boolean
  private readonly emitState: (state: DesktopUpdateState) => void
  private readonly log: (level: "info" | "warn" | "error", message: string) => void
  private readonly autoCheckDelayMs: number
  private snapshot: DesktopUpdateState
  private checkPromise: Promise<DesktopUpdateState> | null = null
  private downloadPromise: Promise<DesktopUpdateState> | null = null
  private startupTimer: ReturnType<typeof setTimeout> | null = null
  private lastAutomaticCheckAt = 0
  private started = false

  constructor(options: DesktopUpdaterOptions) {
    this.updater = options.updater || autoUpdater
    this.now = options.now || Date.now
    this.isPackaged = options.isPackaged || (() => app.isPackaged)
    this.currentVersion = options.currentVersion || (() => app.getVersion())
    this.hasActiveWork = options.hasActiveWork
    this.emitState = options.emit
    this.log = options.log || (() => undefined)
    this.autoCheckDelayMs = options.autoCheckDelayMs ?? DEFAULT_AUTO_CHECK_DELAY_MS
    this.snapshot = initialDesktopUpdateState(this.currentVersion())
  }

  state(): DesktopUpdateState {
    return { ...this.snapshot }
  }

  start(): void {
    if (this.started) return
    this.started = true

    if (!this.isPackaged()) {
      this.setState(updateUnsupportedState(this.snapshot, "Desktop updates are available in installed builds."))
      return
    }

    this.updater.autoDownload = false
    this.updater.autoInstallOnAppQuit = false
    this.updater.allowPrerelease = false

    this.updater.on("checking-for-update", () => {
      this.setState(updateCheckingState(this.snapshot))
    })
    this.updater.on("update-available", (info) => {
      this.setState(updateAvailableState(this.snapshot, {
        version: info.version,
        releaseName: cleanText(info.releaseName),
        releaseNotes: desktopReleaseNotesText(info.releaseNotes),
      }))
      this.log("info", `Desktop update available: ${info.version}`)
    })
    this.updater.on("update-not-available", (info) => {
      this.setState(updateNotAvailableState(this.snapshot, { version: info.version }, this.now()))
      this.log("info", `Desktop is up to date: ${this.snapshot.currentVersion}`)
    })
    this.updater.on("download-progress", (progress: ProgressInfo) => {
      this.setState(downloadProgressState(this.snapshot, {
        percent: progress.percent,
        transferred: progress.transferred,
        total: progress.total,
        bytesPerSecond: progress.bytesPerSecond,
      }))
    })
    this.updater.on("update-downloaded", (info) => {
      this.setState(updateReadyState(this.snapshot, { version: info.version }))
      this.log("info", `Desktop update downloaded: ${info.version}`)
    })
    this.updater.on("error", (error) => {
      this.setState(updateErrorState(this.snapshot, error, this.now()))
      this.log("error", `Desktop updater: ${error.message}`)
    })

    this.startupTimer = setTimeout(() => {
      this.startupTimer = null
      void this.check({ manual: false })
    }, this.autoCheckDelayMs)
  }

  stop(): void {
    if (this.startupTimer) clearTimeout(this.startupTimer)
    this.startupTimer = null
  }

  async check(options: CheckOptions = {}): Promise<DesktopUpdateState> {
    if (!this.started) this.start()
    if (!this.isPackaged()) return this.state()
    if (this.checkPromise) return this.checkPromise

    const manual = options.manual === true
    const now = this.now()
    if (!manual && !shouldRunAutomaticDesktopUpdateCheck(this.lastAutomaticCheckAt, now)) return this.state()
    if (!manual) this.lastAutomaticCheckAt = now

    this.setState(updateCheckingState(this.snapshot))
    this.checkPromise = this.updater.checkForUpdates()
      .then((result) => {
        // Normal providers emit update-available/update-not-available. Keep a
        // deterministic fallback for providers that return null without an event.
        if (!result && this.snapshot.phase === "checking") {
          this.setState(updateNotAvailableState(this.snapshot, { version: this.currentVersion() }, this.now()))
        }
        return this.state()
      })
      .catch((error) => {
        this.setState(updateErrorState(this.snapshot, error, this.now()))
        this.log("error", `Desktop update check failed: ${error instanceof Error ? error.message : String(error)}`)
        return this.state()
      })
      .finally(() => {
        this.checkPromise = null
      })

    return this.checkPromise
  }

  async download(): Promise<DesktopUpdateState> {
    if (!this.started) this.start()
    if (!this.isPackaged()) return this.state()
    if (this.downloadPromise) return this.downloadPromise
    if (this.snapshot.phase === "ready") return this.state()
    if (this.snapshot.phase !== "available") {
      throw new Error("No desktop update is ready to download. Check for updates first.")
    }

    this.setState(downloadProgressState(this.snapshot, { percent: 0 }))
    this.downloadPromise = this.updater.downloadUpdate()
      .then(() => this.state())
      .catch((error) => {
        this.setState(updateErrorState(this.snapshot, error, this.now()))
        this.log("error", `Desktop update download failed: ${error instanceof Error ? error.message : String(error)}`)
        return this.state()
      })
      .finally(() => {
        this.downloadPromise = null
      })

    return this.downloadPromise
  }

  install(): { ok: true } {
    if (!this.isPackaged()) throw new Error("Desktop updates are only installed from packaged builds.")
    if (this.snapshot.phase !== "ready") throw new Error("Download the desktop update before installing it.")
    if (this.hasActiveWork()) throw new Error("Stop or finish the active Grok Build task before restarting to install the update.")

    this.log("info", `Installing desktop update ${this.snapshot.availableVersion || ""}`.trim())
    this.updater.quitAndInstall(false, true)
    return { ok: true }
  }

  private setState(next: DesktopUpdateState): void {
    this.snapshot = next
    this.emitState(this.state())
  }
}
