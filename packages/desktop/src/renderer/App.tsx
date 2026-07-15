import { createSignal, For, Show, onMount } from "solid-js"
import type { Accessor } from "solid-js"
import type { BackendEvent, BackendStatus, TelegramStatus, ProjectSnapshot } from "../preload"
import "./styles.css"

type Provider = "grok" | "lmstudio"
type TaskLog = { kind: "text" | "thought" | "error"; content: string }

const NAV = [
  { id: "new-task", label: "New task", icon: "✦" },
  { id: "search", label: "Search", icon: "⌕" },
  { id: "skills", label: "Skills", icon: "⌘" },
  { id: "scheduled", label: "Scheduled", icon: "◷" },
  { id: "telegram", label: "Telegram", icon: "✈" },
]

export function App(props: { activeProvider: Accessor<string>; setActiveProvider: (provider: string) => void; backendStatus: Accessor<BackendStatus> }) {
  const [prompt, setPrompt] = createSignal("")
  const [workspace, setWorkspace] = createSignal("")
  const [thinking, setThinking] = createSignal(true)
  const [autoApprove, setAutoApprove] = createSignal(false)
  const [running, setRunning] = createSignal(false)
  const [active, setActive] = createSignal("new-task")
  const [events, setEvents] = createSignal<TaskLog[]>([])
  const [telegram, setTelegram] = createSignal<TelegramStatus>({ connected: false })
  const [token, setToken] = createSignal("")
  const [telegramNotice, setTelegramNotice] = createSignal("")
  const [projects, setProjects] = createSignal<ProjectSnapshot[]>([])
  const [selectedProject, setSelectedProject] = createSignal<ProjectSnapshot | null>(null)

  onMount(async () => {
    const savedWorkspace = await window.api.store.get<string>("workspace.last")
    if (savedWorkspace) setWorkspace(savedWorkspace)
    const savedProjects = await window.api.projects.list()
    setProjects(savedProjects)
    const current = savedProjects.find((project) => project.path === savedWorkspace) ?? savedProjects[0]
    if (current) { setSelectedProject(current); setWorkspace(current.path) }
    setTelegram(await window.api.telegram.status())
    window.api.backend.onEvent((event: BackendEvent) => {
      if (event.type === "text" && event.data) setEvents((old) => [...old, { kind: "text", content: event.data! }])
      if (event.type === "thought" && event.data) setEvents((old) => [...old, { kind: "thought", content: event.data! }])
      if (event.type === "error" && event.message) setEvents((old) => [...old, { kind: "error", content: event.message! }])
    })
  })

  const chooseWorkspace = async () => {
    const result = await window.api.dialog.openDirectory()
    if (!result.canceled && result.filePaths[0]) {
      const project = await window.api.projects.add(result.filePaths[0])
      setProjects(await window.api.projects.list())
      setSelectedProject(project)
      setWorkspace(project.path)
      await window.api.store.set("workspace.last", project.path)
    }
  }

  const run = async () => {
    if (!prompt().trim() || !workspace() || running()) return
    setEvents([]); setRunning(true)
    try {
      await window.api.backend.run({ prompt: prompt(), cwd: workspace(), thinking: thinking(), autoApprove: autoApprove() })
    } catch (error) {
      setEvents((old) => [...old, { kind: "error", content: (error as Error).message }])
    } finally { setRunning(false) }
  }

  const connectTelegram = async () => {
    setTelegramNotice("")
    const status = await window.api.telegram.connect(token())
    setTelegram(status)
    setToken("")
    setTelegramNotice(status.connected ? `Connected as @${status.username ?? "bot"}` : status.error ?? "Could not connect")
  }

  return <div class="app-root">
    <aside class="sidebar">
      <div class="brand"><span class="brand__mark">✦</span><span>Grok Build</span></div>
      <nav class="sidebar__nav"><For each={NAV}>{(item) => <button class={`sidebar__item ${active() === item.id ? "sidebar__item--active" : ""}`} onClick={() => setActive(item.id)}><span>{item.icon}</span>{item.label}</button>}</For></nav>
      <div class="sidebar__section">
        <div class="section-heading"><span class="sidebar__section-title">Projects</span><button class="project-add" onClick={chooseWorkspace} title="Add project">+</button></div>
        <Show when={projects().length > 0} fallback={<button class="sidebar__project" onClick={chooseWorkspace}>Add a codebase</button>}>
          <For each={projects()}>{(project) => <button class={`sidebar__project ${selectedProject()?.id === project.id ? "sidebar__project--active" : ""}`} onClick={async () => { setSelectedProject(project); setWorkspace(project.path); await window.api.store.set("workspace.last", project.path) }}><span class="project-name">{project.name}</span><Show when={project.changedFiles > 0}><span class="project-changes">{project.changedFiles}</span></Show></button>}</For>
        </Show>
      </div>
      <div class="sidebar__footer">
        <span class={`status-dot ${props.backendStatus().available ? "status-dot--ready" : ""}`} />
        <span>{props.backendStatus().available ? "Grok Build ready" : "Grok Build unavailable"}</span>
      </div>
    </aside>

    <main class="main-content">
      <Show when={active() === "telegram"} fallback={<>
        <section class="hero">
          <span class="eyebrow">LOCAL-FIRST CODING WORKBENCH</span>
          <h1>Build with Grok. Keep your models close.</h1>
          <p>Grok Build executes the task. LM Studio stays available as your local model endpoint.</p>
        </section>
        <section class="workspace-bar"><span>Project</span><button onClick={chooseWorkspace}>{workspace() || "Choose folder"}</button><Show when={selectedProject()?.isGit}><span class="git-pill">{selectedProject()?.branch} · {selectedProject()?.changedFiles} changed</span></Show></section>
        <section class="provider-row">
          <button class={`provider ${props.activeProvider() === "grok" ? "provider--active" : ""}`} onClick={() => props.setActiveProvider("grok")}><strong>Grok Build</strong><span>agent backend</span></button>
          <button class={`provider ${props.activeProvider() === "lmstudio" ? "provider--active" : ""}`} onClick={() => props.setActiveProvider("lmstudio")}><strong>LM Studio</strong><span>local endpoint</span></button>
        </section>
        <section class="composer">
          <textarea value={prompt()} onInput={(event) => setPrompt(event.currentTarget.value)} placeholder="Describe the coding task…" rows={5} />
          <div class="composer__controls">
            <label><input type="checkbox" checked={thinking()} onChange={(event) => setThinking(event.currentTarget.checked)} /> Reasoning effort</label>
            <label title="Passes Grok Build's documented --yolo flag"><input type="checkbox" checked={autoApprove()} onChange={(event) => setAutoApprove(event.currentTarget.checked)} /> Auto-approve tools</label>
            <button class="primary" disabled={!workspace() || !prompt().trim() || running()} onClick={run}>{running() ? "Running…" : "Run with Grok Build"}</button>
          </div>
        </section>
        <Show when={events().length > 0}><section class="task-output"><For each={events()}>{(entry) => <pre class={`task-output__entry task-output__entry--${entry.kind}`}>{entry.content}</pre>}</For></section></Show>
        <Show when={selectedProject()?.isGit}><section class="review-pane"><div><span class="eyebrow">REVIEW</span><strong>{selectedProject()?.changedFiles} changed files</strong></div><pre>{selectedProject()?.diffStat || "Working tree is clean."}</pre></section></Show>
      </>}>
        <section class="telegram-panel">
          <span class="eyebrow">TELEGRAM BOT CONNECTION</span><h1>Connect your coding workspace to Telegram.</h1>
          <p>Enter a BotFather token. It is verified with <code>getMe</code> and stored only through macOS credential encryption.</p>
          <Show when={!telegram().connected} fallback={<><div class="connected">Connected as @{telegram().username ?? "bot"}</div><button onClick={async () => { await window.api.telegram.disconnect(); setTelegram({ connected: false }) }}>Disconnect</button></>}>
            <div class="token-row"><input type="password" value={token()} onInput={(event) => setToken(event.currentTarget.value)} placeholder="123456:ABC…" /><button class="primary" disabled={!token().trim()} onClick={connectTelegram}>Connect bot</button></div>
            <Show when={telegramNotice()}><p class={telegram().connected ? "notice" : "notice notice--error"}>{telegramNotice()}</p></Show>
          </Show>
          <p class="telegram-note">This release validates and stores the bot connection and can send a message through the main process. Inbound task routing is deliberately not auto-enabled until a chat allowlist is configured.</p>
        </section>
      </Show>
    </main>
  </div>
}
