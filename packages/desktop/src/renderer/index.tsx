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

// Global provider state shared across the whole app
const [activeProvider, setActiveProvider] = createSignal<string>("grok")
const [grokStatus, setGrokStatus] = createSignal<{ running: boolean; error?: string }>({ running: false })

// Menu event listeners
function setupMenuListeners() {
  const unsubProvider = window.api.onMenuSetProvider((provider) => {
    setActiveProvider(provider)
  })

  const unsubCommand = window.api.onMenuCommand((command) => {
    console.info("[menu:command]", command)
  })

  return () => {
    unsubProvider()
    unsubCommand()
  }
}

// Poll Grok status every 5s
function setupStatusPolling() {
  const poll = async () => {
    try {
      const status = await window.api.grok.status()
      setGrokStatus(status)
    } catch {
      setGrokStatus({ running: false, error: "cannot reach main process" })
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
    <App
      activeProvider={activeProvider}
      setActiveProvider={setActiveProvider}
      grokStatus={grokStatus}
    />
  ),
  root
)
