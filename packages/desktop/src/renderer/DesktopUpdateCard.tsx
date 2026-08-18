import { Show, createSignal, onCleanup, onMount } from "solid-js"
import type { DesktopUpdateState } from "../preload"

function formatBytes(value?: number): string {
  if (!value || value <= 0) return ""
  const units = ["B", "KB", "MB", "GB"]
  let size = value
  let unit = 0
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024
    unit += 1
  }
  return `${size >= 10 || unit === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[unit]}`
}

function phaseLabel(state: DesktopUpdateState): string {
  switch (state.phase) {
    case "checking": return "Checking GitHub Releases…"
    case "available": return `Version ${state.availableVersion || "new"} is available.`
    case "downloading": return `Downloading ${Math.round(state.percent || 0)}%…`
    case "ready": return `Version ${state.availableVersion || "new"} is downloaded and ready.`
    case "up-to-date": return `You’re up to date on ${state.currentVersion}.`
    case "unsupported": return state.error || "Desktop updates are unavailable in this build."
    case "error": return state.error || "The desktop update check failed."
    default: return `Installed version ${state.currentVersion}.`
  }
}

export function DesktopUpdateCard() {
  const [state, setState] = createSignal<DesktopUpdateState | null>(null)
  const [busy, setBusy] = createSignal(false)
  const [actionError, setActionError] = createSignal("")

  onMount(() => {
    let disposed = false
    void window.api.app.desktopUpdateState()
      .then((next) => { if (!disposed) setState(next) })
      .catch((error) => { if (!disposed) setActionError(error instanceof Error ? error.message : String(error)) })
    const unsubscribe = window.api.app.onDesktopUpdateState((next) => {
      if (!disposed) {
        setState(next)
        setActionError("")
      }
    })
    onCleanup(() => {
      disposed = true
      unsubscribe()
    })
  })

  const run = async (action: () => Promise<DesktopUpdateState | { ok: true }>) => {
    setBusy(true)
    setActionError("")
    try {
      const result = await action()
      if ("phase" in result) setState(result)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const current = () => state()
  const downloadDetail = () => {
    const snapshot = current()
    if (!snapshot || snapshot.phase !== "downloading") return ""
    const transferred = formatBytes(snapshot.transferred)
    const total = formatBytes(snapshot.total)
    const rate = formatBytes(snapshot.bytesPerSecond)
    return [transferred && total ? `${transferred} / ${total}` : transferred, rate ? `${rate}/s` : ""].filter(Boolean).join(" · ")
  }

  return <div class="settings-card">
    <div>
      <strong>Grok Build Desktop updates</strong>
      <span>Checks this app’s GitHub Releases separately from Grok Build CLI updates.</span>
    </div>

    <Show when={current()} fallback={<p class="provider-notice">Loading desktop update status…</p>}>
      {(snapshot) => <>
        <p class="provider-notice">{phaseLabel(snapshot())}</p>
        <Show when={snapshot().phase === "downloading"}>
          <progress max="100" value={snapshot().percent || 0} style={{ width: "100%" }} />
          <Show when={downloadDetail()}><p class="provider-notice">{downloadDetail()}</p></Show>
        </Show>
        <Show when={snapshot().releaseName}><p class="provider-notice"><strong>{snapshot().releaseName}</strong></p></Show>
        <Show when={snapshot().releaseNotes}>
          <pre class="provider-notice" style={{ "white-space": "pre-wrap", "font-family": "inherit" }}>{snapshot().releaseNotes}</pre>
        </Show>
        <div class="token-row">
          <Show when={snapshot().phase === "available"} fallback={
            <Show when={snapshot().phase === "ready"} fallback={
              <button disabled={busy() || snapshot().phase === "checking" || snapshot().phase === "downloading" || snapshot().phase === "unsupported"} onClick={() => void run(() => window.api.app.checkDesktopUpdate())}>
                {snapshot().phase === "checking" ? "Checking…" : snapshot().phase === "error" ? "Retry update check" : "Check for updates"}
              </button>
            }>
              <button class="primary" disabled={busy()} onClick={() => void run(() => window.api.app.installDesktopUpdate())}>{busy() ? "Restarting…" : "Restart & install"}</button>
            </Show>
          }>
            <button class="primary" disabled={busy()} onClick={() => void run(() => window.api.app.downloadDesktopUpdate())}>{busy() ? "Starting…" : `Download ${snapshot().availableVersion || "update"}`}</button>
          </Show>
        </div>
      </>}
    </Show>

    <Show when={actionError()}><p class="provider-notice">{actionError()}</p></Show>
    <p class="provider-notice">Automatic checks run after launch and when the app regains focus, with a cooldown. Downloads and restart/install stay explicit.</p>
  </div>
}
