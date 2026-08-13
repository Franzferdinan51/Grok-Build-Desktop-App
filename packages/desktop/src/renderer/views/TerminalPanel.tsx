import { For, Show, createEffect, createSignal } from "solid-js"
import { PageEmpty, PageShell } from "./PageShell"

const PRESETS = ["pnpm test", "pnpm typecheck", "git status", "git diff"]

export function TerminalPanel(props: {
  workspace: string
  projectName: string
  command: string
  output: string
  running: boolean
  onCommand: (value: string) => void
  onRun: (command?: string) => void
  onClear: () => void
  onOpenProject: () => void
}) {
  const [history, setHistory] = createSignal<string[]>([])
  const [historyIndex, setHistoryIndex] = createSignal(-1)
  const [copied, setCopied] = createSignal(false)
  let outputEl: HTMLPreElement | undefined

  createEffect(() => {
    props.output
    if (outputEl) outputEl.scrollTop = outputEl.scrollHeight
  })

  const run = (command = props.command) => {
    const next = command.trim()
    if (!next || props.running) return
    if (next !== props.command) props.onCommand(next)
    setHistory((current) => [next, ...current.filter((entry) => entry !== next)].slice(0, 50))
    setHistoryIndex(-1)
    props.onRun(next)
  }

  const browseHistory = (direction: -1 | 1) => {
    const entries = history()
    if (!entries.length) return
    const index = historyIndex()
    const next = direction < 0
      ? Math.min(entries.length - 1, index + 1)
      : index <= 0 ? -1 : index - 1
    setHistoryIndex(next)
    props.onCommand(next < 0 ? "" : entries[next] || "")
  }

  const copyOutput = async () => {
    if (!props.output.trim()) return
    await navigator.clipboard.writeText(props.output)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }

  return <PageShell
    class="page-shell--ide"
    eyebrow="PROJECT TERMINAL"
    title={props.projectName || "Terminal"}
    subtitle={props.workspace || "Commands run only inside the selected workspace"}
    actions={<>
      <button disabled={!props.output} onClick={() => void copyOutput()}>{copied() ? "Copied" : "Copy"}</button>
      <button onClick={() => props.onClear()}>Clear</button>
    </>}
  >
    <Show when={props.workspace} fallback={
      <PageEmpty mark=">_" title="Choose a project first" body="The terminal never leaves the selected workspace. Open a codebase to run tests, builds, and git commands.">
        <button class="primary" onClick={() => props.onOpenProject()}>Open project</button>
      </PageEmpty>
    }>
      <div class="terminal-pane">
        <div class="terminal-presets">
          <For each={PRESETS}>{(preset) =>
            <button disabled={props.running} onClick={() => { props.onCommand(preset); run(preset) }}>{preset}</button>
          }</For>
        </div>
        <Show when={props.output} fallback={
          <PageEmpty mark="$" title="Ready for a command" body="Run project commands here. Output stays in this tab, and printed localhost URLs can open Preview when it is enabled." />
        }>
          <pre class="terminal-log" ref={outputEl}>{props.output}</pre>
        </Show>
        <form class="terminal-input" onSubmit={(event) => { event.preventDefault(); run() }}>
          <span>{props.running ? "…" : "$"}</span>
          <input
            value={props.command}
            disabled={props.running}
            onInput={(event) => { props.onCommand(event.currentTarget.value); setHistoryIndex(-1) }}
            onKeyDown={(event) => {
              if (event.key === "ArrowUp") { event.preventDefault(); browseHistory(-1) }
              else if (event.key === "ArrowDown") { event.preventDefault(); browseHistory(1) }
            }}
            placeholder="pnpm test"
            spellcheck={false}
          />
          <button class="primary" disabled={props.running || !props.command.trim()}>{props.running ? "Running" : "Run"}</button>
        </form>
      </div>
    </Show>
  </PageShell>
}
