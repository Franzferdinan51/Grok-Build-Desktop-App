import { createSignal, onMount } from "solid-js"
import { UI_ICONS } from "./assets/ui-icons"
import "./quick-entry.css"

const QUICK_ENTRY_ACCELERATOR = "CommandOrControl+Shift+Space"

export function QuickEntry() {
  const [text, setText] = createSignal("")
  const [target, setTarget] = createSignal<"current" | "new">("current")
  const [sending, setSending] = createSignal(false)
  const submit = async () => {
    const value = text().trim()
    if (!value || sending()) return
    setSending(true)
    try { await window.api.quickEntry.submit(value, target()); setText("") } finally { setSending(false) }
  }
  onMount(() => document.getElementById("quick-entry-input")?.focus())
  return <main class="quick-entry" aria-label="Grok Build Quick Entry">
    <header><div><img class="quick-entry__mark" src={UI_ICONS["new-task"]} alt="" /><strong>Grok Build</strong><small>Quick Entry</small></div><button onClick={() => void window.api.quickEntry.close()} aria-label="Close Quick Entry">×</button></header>
    <textarea id="quick-entry-input" value={text()} onInput={(event) => setText(event.currentTarget.value)} onKeyDown={(event) => { if (event.key === "Escape") void window.api.quickEntry.close(); else if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void submit() } }} placeholder="Ask Grok Build to code, debug, or plan…" rows={2} />
    <footer><label><span>Send to</span><select value={target()} onChange={(event) => setTarget(event.currentTarget.value as "current" | "new")}><option value="current">Current conversation</option><option value="new">New conversation</option></select></label><small>{QUICK_ENTRY_ACCELERATOR} · Enter to send · Shift+Enter for newline</small><button class="quick-entry__send" disabled={!text().trim() || sending()} onClick={() => void submit()}>{sending() ? "Sending…" : "Send ↵"}</button></footer>
  </main>
}
