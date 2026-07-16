import { createSignal, For, Show, onMount } from "solid-js"
import type { Accessor } from "solid-js"
import type { BackendEvent, BackendStatus, TelegramStatus, ProjectSnapshot, GrokRunRecord, LocalStudioSnapshot, GrokBuildModelCatalog, GrokSkill, ScheduledGrokTask, ProviderSecret } from "../preload"
import "./styles.css"

type TaskLog = { kind: "text" | "thought" | "error"; content: string }

const NAV = [
  { id: "new-task", label: "New task", icon: "✦" },
  { id: "runs", label: "Grok runs", icon: "◴" },
  { id: "review", label: "Review", icon: "⌘" },
  { id: "skills", label: "Skills", icon: "◇" },
  { id: "scheduled", label: "Scheduled", icon: "◷" },
  { id: "runtime", label: "Local runtimes", icon: "▣" },
  { id: "telegram", label: "Telegram", icon: "✈" },
  { id: "settings", label: "Settings", icon: "⚙" },
]

export function App(props: { backendStatus: Accessor<BackendStatus> }) {
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
  const [runs, setRuns] = createSignal<GrokRunRecord[]>([])
  const [localStudioURL, setLocalStudioURL] = createSignal("")
  const [localStudio, setLocalStudio] = createSignal<LocalStudioSnapshot>({ configured: false, reachable: false, baseUrl: "" })
  const [catalog, setCatalog] = createSignal<GrokBuildModelCatalog>({ models: [] })
  const [model, setModel] = createSignal("")
  const [skills, setSkills] = createSignal<GrokSkill[]>([])
  const [schedules, setSchedules] = createSignal<ScheduledGrokTask[]>([])
  const [providerSecrets, setProviderSecrets] = createSignal<ProviderSecret[]>([])
  const [scheduleName, setScheduleName] = createSignal("")
  const [schedulePrompt, setSchedulePrompt] = createSignal("")
  const [scheduleAt, setScheduleAt] = createSignal("")
  const [repeatMinutes, setRepeatMinutes] = createSignal(0)
  const [secretDrafts, setSecretDrafts] = createSignal<Record<string, string>>({})
  const [endpointDrafts, setEndpointDrafts] = createSignal<Record<string, string>>({})
  const [modelDrafts, setModelDrafts] = createSignal<Record<string, string>>({})

  onMount(async () => {
    const savedWorkspace = await window.api.store.get<string>("workspace.last")
    if (savedWorkspace) setWorkspace(savedWorkspace)
    const savedProjects = await window.api.projects.list()
    setProjects(savedProjects)
    const current = savedProjects.find((project) => project.path === savedWorkspace) ?? savedProjects[0]
    if (current) { setSelectedProject(current); setWorkspace(current.path) }
    setTelegram(await window.api.telegram.status())
    setRuns(await window.api.grokRuns.list())
    const runtime = await window.api.localStudio.status()
    setLocalStudio(runtime); setLocalStudioURL(runtime.baseUrl)
    setCatalog(await window.api.backend.models())
    setSkills(await window.api.skills.list(savedWorkspace))
    setSchedules(await window.api.schedules.list())
    const providers = await window.api.providerSecrets.list()
    setProviderSecrets(providers)
    setEndpointDrafts(Object.fromEntries(providers.map((provider) => [provider.id, provider.baseUrl])))
    setModelDrafts(Object.fromEntries(providers.map((provider) => [provider.id, provider.modelId])))
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
      await window.api.backend.run({ prompt: prompt(), cwd: workspace(), model: model() || undefined, thinking: thinking(), autoApprove: autoApprove() })
    } catch (error) {
      setEvents((old) => [...old, { kind: "error", content: (error as Error).message }])
    } finally { setRunning(false) }
    setRuns(await window.api.grokRuns.list())
  }

  const connectTelegram = async () => {
    setTelegramNotice("")
    const status = await window.api.telegram.connect(token())
    setTelegram(status)
    setToken("")
    setTelegramNotice(status.connected ? `Connected as @${status.username ?? "bot"}` : status.error ?? "Could not connect")
  }

  const refreshLocalStudio = async () => setLocalStudio(await window.api.localStudio.status())
  const saveLocalStudioURL = async () => {
    const baseUrl = await window.api.localStudio.setURL(localStudioURL())
    setLocalStudioURL(baseUrl)
    await refreshLocalStudio()
  }

  const createSchedule = async () => {
    const when = Date.parse(scheduleAt())
    if (!scheduleName().trim() || !schedulePrompt().trim() || !workspace() || !Number.isFinite(when)) return
    await window.api.schedules.add({ name: scheduleName(), prompt: schedulePrompt(), cwd: workspace(), model: model() || undefined, runAt: when, repeatMinutes: repeatMinutes() || undefined })
    setSchedules(await window.api.schedules.list()); setScheduleName(""); setSchedulePrompt("")
  }

  const saveSecret = async (id: string) => {
    const value = secretDrafts()[id]
    if (!value?.trim()) return
    await window.api.providerSecrets.save(id, value); setSecretDrafts((old) => ({ ...old, [id]: "" })); setProviderSecrets(await window.api.providerSecrets.list())
  }

  const saveProvider = async (id: string) => {
    await window.api.providerSecrets.saveSettings(id, endpointDrafts()[id] || "", modelDrafts()[id] || "")
    setProviderSecrets(await window.api.providerSecrets.list()); setCatalog(await window.api.backend.models())
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
      <Show when={active() === "skills"} fallback={
      <Show when={active() === "scheduled"} fallback={
      <Show when={active() === "settings"} fallback={
      <Show when={active() === "telegram"} fallback={
        <Show when={active() === "runtime"} fallback={
        <Show when={active() === "runs"} fallback={<>
        <section class="hero">
          <span class="eyebrow">LOCAL-FIRST CODING WORKBENCH</span>
          <h1>Build with Grok. Use your model stack.</h1>
          <p>Grok Build executes every task using its configured catalog: LM Studio models or supported API models.</p>
        </section>
        <section class="workspace-bar"><span>Project</span><button onClick={chooseWorkspace}>{workspace() || "Choose folder"}</button><Show when={selectedProject()?.isGit}><span class="git-pill">{selectedProject()?.branch} · {selectedProject()?.changedFiles} changed</span></Show></section>
        <section class="composer">
          <textarea value={prompt()} onInput={(event) => setPrompt(event.currentTarget.value)} placeholder="Describe the coding task…" rows={5} />
          <div class="composer__controls">
            <label class="model-select">Model
              <select value={model()} onChange={(event) => setModel(event.currentTarget.value)}>
                <option value="">Grok Build default{catalog().defaultModel ? ` (${catalog().defaultModel})` : ""}</option>
                <For each={catalog().models}>{(entry) => <option value={entry}>{entry}</option>}</For>
              </select>
            </label>
            <label><input type="checkbox" checked={thinking()} onChange={(event) => setThinking(event.currentTarget.checked)} /> Reasoning effort</label>
            <label title="Passes Grok Build's documented --yolo flag"><input type="checkbox" checked={autoApprove()} onChange={(event) => setAutoApprove(event.currentTarget.checked)} /> Auto-approve tools</label>
            <button class="primary" disabled={!workspace() || !prompt().trim() || running()} onClick={run}>{running() ? "Running…" : "Run with Grok Build"}</button>
          </div>
        </section>
        <Show when={events().length > 0}><section class="task-output"><For each={events()}>{(entry) => <pre class={`task-output__entry task-output__entry--${entry.kind}`}>{entry.content}</pre>}</For></section></Show>
        <Show when={selectedProject()?.isGit}><section class="review-pane"><div><span class="eyebrow">REVIEW</span><strong>{selectedProject()?.changedFiles} changed files</strong></div><pre>{selectedProject()?.diffStat || "Working tree is clean."}</pre></section></Show>
        </>}>
        <section class="runs-panel">
          <span class="eyebrow">GROK BUILD RUN HISTORY</span>
          <h1>Every coding task is a Grok Build run.</h1>
          <Show when={runs().length > 0} fallback={<p>No runs yet. Pick a project and start a Grok Build task.</p>}>
            <For each={runs()}>{(run) => <article class="run-row"><div><strong>{run.prompt}</strong><span>{run.cwd}</span></div><div class={`run-status run-status--${run.status}`}>{run.status}</div></article>}</For>
          </Show>
        </section>
        </Show>
        }>
          <section class="runtime-panel">
            <span class="eyebrow">LOCAL STUDIO CONTROLLER</span>
            <h1>Watch local inference without touching model lifecycle.</h1>
            <p>Optional read-only connection for GPU/runtime status from Local Studio. Grok Build still powers coding; this never launches, evicts, downloads, or loads a model.</p>
            <div class="token-row"><input value={localStudioURL()} onInput={(event) => setLocalStudioURL(event.currentTarget.value)} placeholder="http://127.0.0.1:8080" /><button class="primary" onClick={saveLocalStudioURL}>Save + Refresh</button></div>
            <Show when={localStudio().configured} fallback={<p class="telegram-note">Add a controller URL to enable monitoring.</p>}>
              <div class={localStudio().reachable ? "connected" : "notice notice--error"}>{localStudio().reachable ? `Connected to ${localStudio().baseUrl}` : localStudio().error}</div>
              <Show when={localStudio().reachable}><pre class="runtime-json">{JSON.stringify({ health: localStudio().health, status: localStudio().status, gpus: localStudio().gpus }, null, 2)}</pre></Show>
            </Show>
          </section>
        </Show>
      }>
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
      }>
        <section class="runs-panel"><span class="eyebrow">GROK BUILD SETTINGS</span><h1>Models and provider credentials.</h1><p>Every provider remains a Grok Build model target. Keys are encrypted with the operating system and injected only into the Grok CLI process.</p>
          <For each={providerSecrets()}>{(provider) => <article class="settings-card"><div><strong>{provider.label}</strong><span>{provider.envKey}</span></div><div class="provider-fields"><label>Base URL<input value={endpointDrafts()[provider.id] || ""} onInput={(event) => setEndpointDrafts((old) => ({ ...old, [provider.id]: event.currentTarget.value }))} /></label><label>Model ID<input value={modelDrafts()[provider.id] || ""} onInput={(event) => setModelDrafts((old) => ({ ...old, [provider.id]: event.currentTarget.value }))} placeholder="e.g. my-coding-model" /></label><button onClick={() => saveProvider(provider.id)}>Save endpoint</button></div><div class="token-row"><input type="password" value={secretDrafts()[provider.id] || ""} onInput={(event) => setSecretDrafts((old) => ({ ...old, [provider.id]: event.currentTarget.value }))} placeholder={provider.configured ? "Credential configured" : "Paste API key (optional for local)"} /><button class="primary" onClick={() => saveSecret(provider.id)}>Save key</button><Show when={provider.configured}><button onClick={async () => { await window.api.providerSecrets.remove(provider.id); setProviderSecrets(await window.api.providerSecrets.list()) }}>Remove</button></Show></div></article>}</For>
          <p class="telegram-note">Model names and endpoints are configured in Grok Build. This page secures credentials; the model picker is populated by <code>grok models</code>.</p>
        </section>
      </Show>
      }>
        <section class="runs-panel"><span class="eyebrow">GROK BUILD SCHEDULES</span><h1>Run coding tasks on a schedule.</h1><p>Schedules execute through Grok Build while the desktop app is running.</p>
          <div class="form-grid"><input value={scheduleName()} onInput={(e) => setScheduleName(e.currentTarget.value)} placeholder="Task name"/><input type="datetime-local" value={scheduleAt()} onInput={(e) => setScheduleAt(e.currentTarget.value)}/><textarea value={schedulePrompt()} onInput={(e) => setSchedulePrompt(e.currentTarget.value)} placeholder="Coding task prompt"/><input type="number" min="0" value={repeatMinutes()} onInput={(e) => setRepeatMinutes(Number(e.currentTarget.value))} placeholder="Repeat minutes (optional)"/><button class="primary" onClick={createSchedule}>Create schedule</button></div>
          <For each={schedules()}>{(task) => <article class="run-row"><div><strong>{task.name}</strong><span>{new Date(task.nextRunAt).toLocaleString()} · {task.cwd}</span></div><div class="row-actions"><button onClick={async () => { await window.api.schedules.toggle(task.id, !task.enabled); setSchedules(await window.api.schedules.list()) }}>{task.enabled ? "Pause" : "Enable"}</button><button onClick={async () => { await window.api.schedules.remove(task.id); setSchedules(await window.api.schedules.list()) }}>Delete</button></div></article>}</For>
        </section>
      </Show>
      }>
        <section class="runs-panel"><span class="eyebrow">GROK BUILD SKILLS</span><h1>Project and user skills.</h1><p>Discovered from Grok, agent, Claude, and Cursor-compatible skill directories. Project skills win on name conflicts.</p><button onClick={async () => setSkills(await window.api.skills.list(workspace()))}>Refresh</button>
          <For each={skills()}>{(skill) => <article class="run-row"><div><strong>{skill.name}</strong><span>{skill.description || skill.path}</span></div><div class="skill-scope">{skill.scope}</div></article>}</For>
        </section>
      </Show>
    </main>
  </div>
}
