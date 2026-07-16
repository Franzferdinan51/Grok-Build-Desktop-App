/**
 * renderer/index.tsx — SolidJS renderer entry point
 *
 * Bootstraps the SolidJS app into #root, wires up global state,
 * and registers menu event listeners from the main process.
 */

import { render } from "solid-js/web"
import { createSignal, onMount, onCleanup } from "solid-js"
import { App } from "./App"

const root = document.getElementById("root")
if (!root) {
  throw new Error("#root element not found")
}

const [backendStatus, setBackendStatus] = createSignal<{ available: boolean; command: string; version?: string; error?: string }>({ available: false, command: "grok" })

// Backend probes spawn the Grok CLI, so keep them infrequent, non-overlapping,
// and paused while the window is hidden.
function setupStatusPolling() {
  let polling = false
  const poll = async () => {
    if (polling || document.hidden) return
    polling = true
    try {
      const status = await window.api.backend.status()
      setBackendStatus(status)
    } catch {
      setBackendStatus({ available: false, command: "grok", error: "cannot reach main process" })
    } finally {
      polling = false
    }
  }

  const onVisibilityChange = () => { if (!document.hidden) void poll() }
  document.addEventListener("visibilitychange", onVisibilityChange)
  void poll()
  const interval = setInterval(() => void poll(), 30_000)
  return () => {
    clearInterval(interval)
    document.removeEventListener("visibilitychange", onVisibilityChange)
  }
}

onMount(() => {
  const cleanupPoll = setupStatusPolling()

  onCleanup(() => {
    cleanupPoll()
  })
})

render(
  () => (
    <App backendStatus={backendStatus} />
  ),
  root
)
