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

// Menu event listeners
function setupMenuListeners() {
  const unsubCommand = window.api.onMenuCommand((command) => {
    console.info("[menu:command]", command)
  })

  return () => {
    unsubCommand()
  }
}

// Probe the Grok Build backend every 5s. This only runs `grok --version`; it
// never loads a model or starts an agent session.
function setupStatusPolling() {
  const poll = async () => {
    try {
      const status = await window.api.backend.status()
      setBackendStatus(status)
    } catch {
      setBackendStatus({ available: false, command: "grok", error: "cannot reach main process" })
    }
  }

  poll()
  const interval = setInterval(poll, 5_000)
  return () => clearInterval(interval)
}

onMount(() => {
  const cleanupMenu = setupMenuListeners()
  const cleanupPoll = setupStatusPolling()

  onCleanup(() => {
    cleanupMenu()
    cleanupPoll()
  })
})

render(
  () => (
    <App backendStatus={backendStatus} />
  ),
  root
)
