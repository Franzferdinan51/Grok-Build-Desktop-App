import { createEffect, createSignal, For, Show, onMount } from "solid-js"
import type { Accessor } from "solid-js"
import type { BackendEvent, BackendStatus, TelegramStatus, ProjectSnapshot, GrokRunRecord, LocalStudioSnapshot, GrokBuildModelCatalog, GrokSkill, ScheduledGrokTask, ProviderSecret, WorkspaceFile } from "../preload"
import "./styles.css"

type TaskLog = { kind: "text" | "thought" | "error"; content: string }
type ChatMessage = { id: string; role: "user" | "assistant"; logs: TaskLog[]; createdAt: number }
type QueuedPrompt = { id: string; text: string }

const splitThinking = (logs: TaskLog[]): TaskLog[] => {
  const merged = logs.reduce<TaskLog[]>((all, log) => {
    const previous = all.at(-1)
    if (previous?.kind === log.kind) previous.content += log.content
    else all.push({ ...log })
    return all
  }, [])
  return merged.flatMap((log) => {
    if (log.kind !== "text" || !log.content.includes("<think>")) return [log]
    const parts: TaskLog[] = []
    const pattern = /<think>([\s\S]*?)(?:<\/think>|$)/gi
    let cursor = 0
    for (const match of log.content.matchAll(pattern)) {
      const index = match.index ?? 0
      const before = log.content.slice(cursor, index).trim()
      if (before) parts.push({ kind: "text", content: before })
      const thought = match[1]?.trim()
      if (thought) parts.push({ kind: "thought", content: thought })
      cursor = index + match[0].length
    }
    const after = log.content.slice(cursor).replace(/<\/think>/gi, "").trim()
    if (after) parts.push({ kind: "text", content: after })
    return parts
  })
}

const NAV = [
  { id: "new-task", label: "New task", icon: "✦" },
  { id: "workspace", label: "Workspace", icon: "▤" },
  { id: "terminal", label: "Terminal", icon: ">_" },
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
  const [messages, setMessages] = createSignal<ChatMessage[]>([])
  const [queuedPrompts, setQueuedPrompts] = createSignal<QueuedPrompt[]>([])
  const [historyIndex, setHistoryIndex] = createSignal(-1)
  const [historyDraft, setHistoryDraft] = createSignal("")
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
  const [providerNotices, setProviderNotices] = createSignal<Record<string, string>>({})
  const [customName, setCustomName] = createSignal("")
  const [customURL, setCustomURL] = createSignal("")
  const [customModel, setCustomModel] = createSignal("")
  const [skillSearch, setSkillSearch] = createSignal("")
  const [runSearch, setRunSearch] = createSignal("")
  const [files, setFiles] = createSignal<WorkspaceFile[]>([])
  const [fileSearch, setFileSearch] = createSignal("")
  const [openFile, setOpenFile] = createSignal("")
  const [fileContent, setFileContent] = createSignal("")
  const [fileNotice, setFileNotice] = createSignal("")
  const [terminalCommand, setTerminalCommand] = createSignal("")
  const [terminalOutput, setTerminalOutput] = createSignal("")
  const [terminalRunning, setTerminalRunning] = createSignal(false)
  const [cliPath, setCliPath] = createSignal("")
  const [cliNotice, setCliNotice] = createSignal("")
  const [gitChanges, setGitChanges] = createSignal<{ status: string; path: string }[]>([])
  const [selectedDiff, setSelectedDiff] = createSignal("")
  const [diffContent, setDiffContent] = createSignal("")
  let messagesElement: HTMLDivElement | undefined

  createEffect(() => {
    messages(); events()
    queueMicrotask(() => messagesElement?.scrollTo({ top: messagesElement.scrollHeight, behavior: running() ? "smooth" : "auto" }))
  })

  const conversationKey = (root = workspace()) => `chat.${encodeURIComponent(root)}`
  const loadConversation = async (root: string) => {
    setMessages((await window.api.store.get<ChatMessage[]>(conversationKey(root))) ?? [])
    setQueuedPrompts([]); setHistoryIndex(-1); setHistoryDraft("")
  }
  const saveConversation = async (next: ChatMessage[]) => {
    setMessages(next)
    if (workspace()) await window.api.store.set(conversationKey(), next)
  }

  onMount(async () => {
    const savedWorkspace = await window.api.store.get<string>("workspace.last")
    let savedProjects = await window.api.projects.list()
    if (savedProjects.length === 0) {
      const scratch = await window.api.projects.scratch()
      savedProjects = [scratch]
    }
    setProjects(savedProjects)
    const current = savedProjects.find((project) => project.path === savedWorkspace) ?? savedProjects[0]
    if (current) {
      setSelectedProject(current)
      setWorkspace(current.path)
      await window.api.store.set("workspace.last", current.path)
      await loadConversation(current.path)
    }
    setTelegram(await window.api.telegram.status())
    setRuns(await window.api.grokRuns.list())
    const runtime = await window.api.localStudio.status()
    setLocalStudio(runtime); setLocalStudioURL(runtime.baseUrl)
    setCatalog(await window.api.backend.models())
    setSkills(await window.api.skills.list(current?.path))
    setSchedules(await window.api.schedules.list())
    const providers = await window.api.providerSecrets.list()
    setProviderSecrets(providers)
    setEndpointDrafts(Object.fromEntries(providers.map((provider) => [provider.id, provider.baseUrl])))
    setModelDrafts(Object.fromEntries(providers.map((provider) => [provider.id, provider.modelId])))
    setCliPath((await window.api.store.get<string>("grok.cliPath")) || props.backendStatus().command || "grok")
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
      await loadProject(project)
    }
  }

  const useScratchWorkspace = async () => {
    const scratch = await window.api.projects.scratch()
    const allProjects = await window.api.projects.list()
    setProjects(allProjects)
    setSelectedProject(scratch)
    setWorkspace(scratch.path)
    await window.api.store.set("workspace.last", scratch.path)
    await loadProject(scratch)
  }

  const run = async (requested?: string) => {
    const submitted = (requested ?? prompt()).trim()
    if (!submitted || !workspace()) return
    if (running()) {
      setQueuedPrompts((old) => [...old, { id: crypto.randomUUID(), text: submitted }])
      setPrompt(""); setHistoryIndex(-1)
      return
    }
    await saveConversation([...messages(), { id: crypto.randomUUID(), role: "user", logs: [{ kind: "text", content: submitted }], createdAt: Date.now() }])
    setPrompt(""); setEvents([]); setRunning(true)
    try {
      await window.api.backend.run({ prompt: submitted, cwd: workspace(), model: model() || undefined, thinking: thinking(), autoApprove: autoApprove() })
    } catch (error) {
      setEvents((old) => [...old, { kind: "error", content: (error as Error).message }])
    } finally {
      setRunning(false)
      const completed = splitThinking(events())
      if (completed.length) await saveConversation([...messages(), { id: crypto.randomUUID(), role: "assistant", logs: completed, createdAt: Date.now() }])
      setEvents([])
    }
    setRuns(await window.api.grokRuns.list())
    const next = queuedPrompts()[0]
    if (next) {
      setQueuedPrompts((old) => old.slice(1))
      queueMicrotask(() => void run(next.text))
    }
  }

  const browsePromptHistory = (direction: -1 | 1) => {
    const history = messages().filter((message) => message.role === "user").map((message) => message.logs.map((log) => log.content).join("\n")).reverse()
    if (!history.length) return
    if (direction === -1) {
      if (historyIndex() === -1) setHistoryDraft(prompt())
      const next = Math.min(history.length - 1, historyIndex() + 1)
      setHistoryIndex(next); setPrompt(history[next]!)
    } else if (historyIndex() > 0) {
      const next = historyIndex() - 1; setHistoryIndex(next); setPrompt(history[next]!)
    } else if (historyIndex() === 0) {
      setHistoryIndex(-1); setPrompt(historyDraft())
    }
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
  const addProvider = async () => {
    await window.api.providers.add(customName(), customURL(), customModel())
    const providers = await window.api.providerSecrets.list(); setProviderSecrets(providers)
    setEndpointDrafts(Object.fromEntries(providers.map((provider) => [provider.id, provider.baseUrl]))); setModelDrafts(Object.fromEntries(providers.map((provider) => [provider.id, provider.modelId])))
    setCustomName(""); setCustomURL(""); setCustomModel("")
  }
  const refreshFiles = async (root = workspace()) => { if (root) setFiles(await window.api.workspace.files(root)) }
  const selectFile = async (path: string) => { setOpenFile(path); setFileContent(await window.api.workspace.read(workspace(), path)); setFileNotice("") }
  const saveFile = async () => { if (!openFile()) return; await window.api.workspace.write(workspace(), openFile(), fileContent()); setFileNotice("Saved") }
  const runCommand = async () => {
    if (!workspace() || !terminalCommand().trim() || terminalRunning()) return
    setTerminalRunning(true); const command = terminalCommand(); setTerminalOutput((old) => `${old}${old ? "\n" : ""}$ ${command}\n`)
    const result = await window.api.workspace.command(workspace(), command); setTerminalOutput((old) => old + result.stdout + result.stderr + `\n[exit ${result.code}]\n`); setTerminalRunning(false)
  }
  const refreshDiff = async (root = workspace()) => { if (root) { setGitChanges(await window.api.workspace.gitChanges(root)); setSelectedDiff(""); setDiffContent("") } }

  const loadProject = async (project: ProjectSnapshot) => {
    setOpenFile(""); setFileContent(""); setFileNotice(""); setSelectedDiff(""); setDiffContent("")
    if (active() === "workspace") await refreshFiles(project.path)
    if (active() === "review") await refreshDiff(project.path)
    if (active() === "skills") setSkills(await window.api.skills.list(project.path))
    await loadConversation(project.path)
  }

  const selectProject = async (project: ProjectSnapshot) => {
    setSelectedProject(project); setWorkspace(project.path)
    await window.api.store.set("workspace.last", project.path)
    await loadProject(project)
  }

  const navigate = async (view: string) => {
    setActive(view)
    if (view === "workspace") await refreshFiles()
    if (view === "review") await refreshDiff()
    if (view === "skills") setSkills(await window.api.skills.list(workspace() || undefined))
    if (view === "runs") setRuns(await window.api.grokRuns.list())
    if (view === "scheduled") setSchedules(await window.api.schedules.list())
    if (view === "settings") {
      setCatalog(await window.api.backend.models())
      const providers = await window.api.providerSecrets.list()
      setProviderSecrets(providers)
      setEndpointDrafts(Object.fromEntries(providers.map((provider) => [provider.id, provider.baseUrl])))
      setModelDrafts(Object.fromEntries(providers.map((provider) => [provider.id, provider.modelId])))
    }
  }

  return <div class="app-root">
    <aside class="sidebar">
      <div class="brand"><span class="brand__mark">✦</span><span>Grok Build</span></div>
      <nav class="sidebar__nav"><For each={NAV}>{(item) => <button class={`sidebar__item ${active() === item.id ? "sidebar__item--active" : ""}`} onClick={() => void navigate(item.id)}><span>{item.icon}</span>{item.label}</button>}</For></nav>
      <div class="sidebar__section">
        <div class="section-heading"><span class="sidebar__section-title">Projects</span><button class="project-add" onClick={chooseWorkspace} title="Add project">+</button></div>
        <Show when={projects().length > 0} fallback={<button class="sidebar__project" onClick={chooseWorkspace}>Add a codebase</button>}>
          <For each={projects()}>{(project) => <button class={`sidebar__project ${selectedProject()?.id === project.id ? "sidebar__project--active" : ""}`} onClick={() => void selectProject(project)}><span class="project-name">{project.name}</span><Show when={project.changedFiles > 0}><span class="project-changes">{project.changedFiles}</span></Show></button>}</For>
        </Show>
      </div>
      <div class="sidebar__footer">
        <span class={`status-dot ${props.backendStatus().available ? "status-dot--ready" : ""}`} />
        <span>{props.backendStatus().available ? "Grok Build ready" : "Grok Build unavailable"}</span>
      </div>
    </aside>

    <main class="main-content">
      <Show when={active() === "review"} fallback={
      <Show when={active() === "workspace"} fallback={
      <Show when={active() === "terminal"} fallback={
      <Show when={active() === "skills"} fallback={
      <Show when={active() === "scheduled"} fallback={
      <Show when={active() === "settings"} fallback={
      <Show when={active() === "telegram"} fallback={
        <Show when={active() === "runtime"} fallback={
        <Show when={active() === "runs"} fallback={<>
        <section class="chat-thread">
          <header class="chat-header"><div><strong>{selectedProject()?.name || "Scratch"}</strong><span>{selectedProject()?.isGit ? `${selectedProject()?.branch} · ${selectedProject()?.changedFiles} changed` : "Grok Build workspace"}</span></div><div class="chat-header__actions"><button onClick={async () => { await saveConversation([]); setEvents([]) }}>New chat</button><button onClick={chooseWorkspace}>Open project</button></div></header>
          <div class="chat-messages" ref={messagesElement}>
            <Show when={messages().length || running()} fallback={<div class="chat-empty"><span class="chat-empty__mark">✦</span><h1>What do you want to build?</h1><p>Ask Grok Build to create, debug, explain, or change code.</p><div><button onClick={() => setPrompt("Review this codebase and suggest the highest-impact improvements.")}>Review this project</button><button onClick={() => setPrompt("Find and fix the most important bug in this codebase.")}>Fix a bug</button><button onClick={() => setPrompt("Add tests for the most critical untested behavior.")}>Add tests</button></div></div>}>
              <For each={messages()}>{(message) => <article class={`chat-message chat-message--${message.role}`}><div class="chat-avatar">{message.role === "assistant" ? "✦" : "You"}</div><div class="chat-message__body"><For each={splitThinking(message.logs)}>{(entry) => <Show when={entry.kind !== "thought"} fallback={<details class="reasoning"><summary>Thought process</summary><pre>{entry.content}</pre></details>}><pre class={entry.kind === "error" ? "chat-error" : ""}>{entry.content}</pre></Show>}</For><div class="message-actions"><span>{new Date(message.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span><button onClick={() => navigator.clipboard.writeText(message.logs.map((log) => log.content).join("\n"))}>Copy</button><Show when={message.role === "assistant"}><button onClick={() => { const previous = messages().slice(0, messages().findIndex((entry) => entry.id === message.id)).reverse().find((entry) => entry.role === "user"); if (previous) setPrompt(previous.logs.map((log) => log.content).join("\n")) }}>Retry</button></Show></div></div></article>}</For>
              <Show when={running()}><article class="chat-message chat-message--assistant"><div class="chat-avatar">✦</div><div class="chat-message__body"><Show when={events().length} fallback={<div class="typing-indicator"><i/><i/><i/></div>}><For each={splitThinking(events())}>{(entry) => <Show when={entry.kind !== "thought"} fallback={<details class="reasoning"><summary>Thinking…</summary><pre>{entry.content}</pre></details>}><pre class={entry.kind === "error" ? "chat-error" : ""}>{entry.content}</pre></Show>}</For></Show></div></article></Show>
            </Show>
          </div>
        </section>
        <Show when={queuedPrompts().length}><section class="prompt-queue"><span>Queued</span><For each={queuedPrompts()}>{(entry, index) => <div><b>{index() + 1}</b><p>{entry.text}</p><button onClick={() => setQueuedPrompts((old) => old.filter((item) => item.id !== entry.id))}>×</button></div>}</For></section></Show>
        <section class="chat-composer chat-composer--docked" aria-label="Grok Build task composer">
          <div class="chat-composer__context">
            <button class="context-pill" onClick={chooseWorkspace} title={workspace()}><span class="context-pill__icon">⌘</span>{selectedProject()?.name || "Scratch"}</button>
            <span class="composer-hint">Grok Build can read and edit this workspace</span>
          </div>
          <textarea value={prompt()} onInput={(event) => { setPrompt(event.currentTarget.value); setHistoryIndex(-1) }} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") { event.preventDefault(); void run() } else if (event.key === "ArrowUp" && (event.currentTarget.selectionStart === 0 || !prompt())) { event.preventDefault(); browsePromptHistory(-1) } else if (event.key === "ArrowDown" && event.currentTarget.selectionStart === prompt().length) { event.preventDefault(); browsePromptHistory(1) } }} placeholder={running() ? "Send another instruction — it will be queued…" : "Ask Grok Build to code, debug, or explain…"} rows={3} />
          <div class="chat-composer__footer">
            <button class="composer-icon" onClick={chooseWorkspace} title="Attach or open a workspace">＋</button>
            <label class={`composer-toggle ${thinking() ? "composer-toggle--active" : ""}`} title="Use high reasoning effort"><input type="checkbox" checked={thinking()} onChange={(event) => setThinking(event.currentTarget.checked)} />◇ Think</label>
            <label class={`composer-toggle ${autoApprove() ? "composer-toggle--warning" : ""}`} title="Allow Grok Build to execute tools without asking"><input type="checkbox" checked={autoApprove()} onChange={(event) => setAutoApprove(event.currentTarget.checked)} />⚡ Auto</label>
            <select class="composer-model" value={model()} onChange={(event) => setModel(event.currentTarget.value)} aria-label="Model">
              <option value="">{catalog().defaultModel || "Default model"}</option>
              <For each={catalog().models}>{(entry) => <option value={entry}>{entry}</option>}</For>
            </select>
            <button class="composer-send" disabled={!workspace() || !prompt().trim()} onClick={() => void run()} title={running() ? "Queue instruction (⌘↵)" : "Send (⌘↵)"}>{running() ? "+" : "↑"}</button>
            <Show when={running()}><button class="composer-stop" onClick={() => window.api.backend.cancel()} title="Stop current task"><span /></button></Show>
          </div>
        </section>
        </>}>
        <section class="runs-panel">
          <span class="eyebrow">GROK BUILD RUN HISTORY</span>
          <h1>Every coding task is a Grok Build run.</h1>
          <div class="token-row"><input value={runSearch()} onInput={(e) => setRunSearch(e.currentTarget.value)} placeholder="Search prompts, projects, sessions"/><button onClick={async () => setRuns(await window.api.grokRuns.list())}>Refresh</button></div>
          <Show when={runs().length > 0} fallback={<p>No runs yet. Pick a project and start a Grok Build task.</p>}>
            <For each={runs().filter((run) => `${run.prompt} ${run.cwd} ${run.grokSessionId || ""}`.toLowerCase().includes(runSearch().toLowerCase()))}>{(run) => <article class="run-row"><div><strong>{run.prompt}</strong><span>{run.cwd}{run.model ? ` · ${run.model}` : ""}{run.grokSessionId ? ` · session ${run.grokSessionId}` : ""}{run.error ? ` · ${run.error}` : ""}</span></div><div class={`run-status run-status--${run.status}`}>{run.status}</div></article>}</For>
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
        <section class="runs-panel"><span class="eyebrow">GROK BUILD SETTINGS</span><h1>Backend, models, and providers.</h1><p>The maintained backend is your <button class="link-button" onClick={() => window.api.app.openExternal("https://github.com/Franzferdinan51/grok-build")}>Franzferdinan51/grok-build fork</button>, with xAI upstream sync preserved. Every provider remains a Grok Build model target.</p>
          <div class="settings-card"><strong>Grok Build CLI backend</strong><span>{props.backendStatus().version || "Select a locally built fork binary or a PATH command."}</span><div class="token-row"><input value={cliPath()} onInput={(e) => setCliPath(e.currentTarget.value)} placeholder="/path/to/grok or grok"/><button class="primary" onClick={async () => { const status = await window.api.backend.setPath(cliPath()); setCliNotice(status.available ? `Connected: ${status.version || status.command}` : status.error || "Unavailable"); if (status.available) setCatalog(await window.api.backend.models()) }}>Save + Probe</button></div><Show when={cliNotice()}><p class="provider-notice">{cliNotice()}</p></Show></div>
          <div class="settings-card"><strong>Add another OpenAI-compatible provider</strong><div class="provider-fields"><label>Name<input value={customName()} onInput={(e) => setCustomName(e.currentTarget.value)} placeholder="Together AI" /></label><label>Base URL<input value={customURL()} onInput={(e) => setCustomURL(e.currentTarget.value)} placeholder="https://api.example.com/v1" /></label><label>Model ID<input value={customModel()} onInput={(e) => setCustomModel(e.currentTarget.value)} placeholder="coding-model" /></label><button onClick={addProvider}>Add provider</button></div></div>
          <For each={providerSecrets()}>{(provider) => <article class="settings-card"><div><strong>{provider.label}</strong><span>{provider.envKey}</span></div><div class="provider-fields"><label>Base URL<input value={endpointDrafts()[provider.id] || ""} onInput={(event) => setEndpointDrafts((old) => ({ ...old, [provider.id]: event.currentTarget.value }))} /></label><label>Model ID<input value={modelDrafts()[provider.id] || ""} onInput={(event) => setModelDrafts((old) => ({ ...old, [provider.id]: event.currentTarget.value }))} placeholder="e.g. my-coding-model" /></label><button onClick={() => saveProvider(provider.id)}>Save endpoint</button></div><div class="token-row"><input type="password" value={secretDrafts()[provider.id] || ""} onInput={(event) => setSecretDrafts((old) => ({ ...old, [provider.id]: event.currentTarget.value }))} placeholder={provider.configured ? "Credential configured" : "Paste API key (optional for local)"} /><button class="primary" onClick={() => saveSecret(provider.id)}>Save key</button><button onClick={async () => { const result = await window.api.providerSecrets.test(provider.id); setProviderNotices((old) => ({ ...old, [provider.id]: result.message })) }}>Test</button><Show when={provider.configured}><button onClick={async () => { await window.api.providerSecrets.remove(provider.id); setProviderSecrets(await window.api.providerSecrets.list()) }}>Remove key</button></Show><Show when={provider.id.startsWith("custom-")}><button onClick={async () => { await window.api.providers.remove(provider.id); setProviderSecrets(await window.api.providerSecrets.list()) }}>Delete provider</button></Show></div><Show when={providerNotices()[provider.id]}><p class="provider-notice">{providerNotices()[provider.id]}</p></Show></article>}</For>
          <p class="telegram-note">Model names and endpoints are configured in Grok Build. This page secures credentials; the model picker is populated by <code>grok models</code>.</p>
        </section>
      </Show>
      }>
        <section class="runs-panel"><span class="eyebrow">GROK BUILD SCHEDULES</span><h1>Run coding tasks on a schedule.</h1><p>Schedules execute through Grok Build while the desktop app is running.</p>
          <div class="form-grid"><input value={scheduleName()} onInput={(e) => setScheduleName(e.currentTarget.value)} placeholder="Task name"/><input type="datetime-local" value={scheduleAt()} onInput={(e) => setScheduleAt(e.currentTarget.value)}/><textarea value={schedulePrompt()} onInput={(e) => setSchedulePrompt(e.currentTarget.value)} placeholder="Coding task prompt"/><input type="number" min="0" value={repeatMinutes()} onInput={(e) => setRepeatMinutes(Number(e.currentTarget.value))} placeholder="Repeat minutes (optional)"/><button class="primary" onClick={createSchedule}>Create schedule</button></div>
          <For each={schedules()}>{(task) => <article class="run-row"><div><strong>{task.name}</strong><span>{new Date(task.nextRunAt).toLocaleString()} · {task.cwd}{task.lastStatus ? ` · last ${task.lastStatus}` : ""}</span></div><div class="row-actions"><button onClick={async () => { await window.api.schedules.runNow(task.id); setSchedules(await window.api.schedules.list()) }}>Run now</button><button onClick={async () => { await window.api.schedules.toggle(task.id, !task.enabled); setSchedules(await window.api.schedules.list()) }}>{task.enabled ? "Pause" : "Enable"}</button><button onClick={async () => { await window.api.schedules.remove(task.id); setSchedules(await window.api.schedules.list()) }}>Delete</button></div></article>}</For>
        </section>
      </Show>
      }>
        <section class="runs-panel"><span class="eyebrow">GROK BUILD SKILLS</span><h1>Project and user skills.</h1><p>Discovered from Grok, agent, Claude, and Cursor-compatible skill directories. Project skills win on name conflicts.</p><div class="token-row"><input value={skillSearch()} onInput={(e) => setSkillSearch(e.currentTarget.value)} placeholder="Search skills"/><button onClick={async () => setSkills(await window.api.skills.list(workspace()))}>Refresh</button></div>
          <For each={skills().filter((skill) => `${skill.name} ${skill.description}`.toLowerCase().includes(skillSearch().toLowerCase()))}>{(skill) => <article class="run-row"><div><strong>{skill.name}</strong><span>{skill.description || skill.path}</span></div><div class="skill-scope">{skill.scope}</div></article>}</For>
        </section>
      </Show>
      }>
        <section class="ide-panel"><div class="terminal-toolbar"><div><span class="eyebrow">PROJECT TERMINAL</span><strong>{workspace() || "Choose a project"}</strong></div><button onClick={() => setTerminalOutput("")}>Clear</button></div><pre class="terminal-output">{terminalOutput() || "Run project commands here. Commands execute only inside the selected workspace."}</pre><div class="terminal-input"><span>$</span><input value={terminalCommand()} onInput={(e) => setTerminalCommand(e.currentTarget.value)} onKeyDown={(e) => { if (e.key === "Enter") void runCommand() }} placeholder="pnpm test"/><button class="primary" disabled={terminalRunning() || !workspace()} onClick={runCommand}>{terminalRunning() ? "Running…" : "Run"}</button></div></section>
      </Show>
      }>
        <section class="ide-panel"><div class="ide-toolbar"><div><span class="eyebrow">CODE WORKSPACE</span><strong>{openFile() || "Select a file"}</strong></div><div><button onClick={() => void refreshFiles()}>Refresh files</button><button class="primary" disabled={!openFile()} onClick={saveFile}>Save</button></div></div><div class="ide-grid"><aside class="file-tree"><input value={fileSearch()} onInput={(e) => setFileSearch(e.currentTarget.value)} placeholder="Filter files"/><Show when={files().length} fallback={<button onClick={() => void refreshFiles()}>Load project files</button>}><For each={files().filter((file) => file.path.toLowerCase().includes(fileSearch().toLowerCase()))}>{(file) => <button class={openFile() === file.path ? "active" : ""} onClick={() => selectFile(file.path)}>{file.path}</button>}</For></Show></aside><div class="code-editor"><Show when={openFile()} fallback={<div class="editor-empty">Choose a project file to inspect and edit.</div>}><textarea spellcheck={false} value={fileContent()} onInput={(e) => { setFileContent(e.currentTarget.value); setFileNotice("Modified") }} onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "s") { e.preventDefault(); void saveFile() } }}/><span class="editor-status">{fileNotice()} · ⌘S to save</span></Show></div></div></section>
      </Show>
      }>
        <section class="ide-panel"><div class="ide-toolbar"><div><span class="eyebrow">GIT REVIEW</span><strong>{selectedProject()?.branch || "Selected project"}</strong></div><button onClick={() => void refreshDiff()}>Refresh changes</button></div><div class="ide-grid"><aside class="file-tree"><Show when={gitChanges().length} fallback={<button onClick={() => void refreshDiff()}>Load changed files</button>}><For each={gitChanges()}>{(change) => <button class={selectedDiff() === change.path ? "active" : ""} onClick={async () => { setSelectedDiff(change.path); setDiffContent(await window.api.workspace.gitDiff(workspace(), change.path)) }}><span class="change-code">{change.status}</span> {change.path}</button>}</For></Show></aside><div class="code-editor"><Show when={selectedDiff()} fallback={<div class="editor-empty">Select a changed file to review its diff.</div>}><pre class="diff-view">{diffContent()}</pre></Show></div></div></section>
      </Show>
    </main>
  </div>
}
