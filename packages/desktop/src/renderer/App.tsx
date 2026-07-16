import { createEffect, createSignal, For, Show, onCleanup, onMount } from "solid-js"
import type { Accessor } from "solid-js"
import type { BackendEvent, BackendStatus, TelegramStatus, ProjectSnapshot, GrokRunRecord, LocalStudioSnapshot, GrokBuildModelCatalog, GrokSkill, ScheduledGrokTask, ProviderSecret, WorkspaceFile } from "../preload"
import { splitThinking, type TaskLog } from "./chat-utils"
import { DESKTOP_SLASH_COMMANDS, matchingSlashCommands, parseSlashCommand } from "./slash-commands"
import { buildAutoLearnPrompt, buildLearnPrompt } from "./learn-prompt"
import "./styles.css"
import "./preview-layout.css"

type ChatMessage = { id: string; role: "user" | "assistant"; logs: TaskLog[]; createdAt: number }
type QueuedPrompt = { id: string; text: string }
type WorkspaceGoal = { objective: string; status: "active" | "paused" | "completed"; iterations: number; createdAt: number; updatedAt: number }

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
  const [telegramAllowedChats, setTelegramAllowedChats] = createSignal("")
  const [telegramPendingChats, setTelegramPendingChats] = createSignal<string[]>([])
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
  const [oauthNotice, setOauthNotice] = createSignal("")
  const [gitChanges, setGitChanges] = createSignal<{ status: string; path: string }[]>([])
  const [selectedDiff, setSelectedDiff] = createSignal("")
  const [diffContent, setDiffContent] = createSignal("")
  const [previewEnabled, setPreviewEnabled] = createSignal(false)
  const [previewOpen, setPreviewOpen] = createSignal(false)
  const [previewURL, setPreviewURL] = createSignal("http://localhost:3000")
  const [previewDraft, setPreviewDraft] = createSignal("http://localhost:3000")
  const [previewReload, setPreviewReload] = createSignal(0)
  const [previewDevice, setPreviewDevice] = createSignal<"desktop" | "tablet" | "mobile">("desktop")
  const [previewStatus, setPreviewStatus] = createSignal("Ready to connect")
  const [agentAppControls, setAgentAppControls] = createSignal(false)
  const [subagentsEnabled, setSubagentsEnabled] = createSignal(true)
  const [delegationMode, setDelegationMode] = createSignal<"balanced" | "aggressive">("balanced")
  const [slashSelection, setSlashSelection] = createSignal(0)
  const [slashNotice, setSlashNotice] = createSignal("")
  const [moaEnabled, setMoaEnabled] = createSignal(false)
  const [moaCandidates, setMoaCandidates] = createSignal(3)
  const [moaReferenceModels, setMoaReferenceModels] = createSignal<string[]>([])
  const [moaAggregatorModel, setMoaAggregatorModel] = createSignal("")
  const [selfVerify, setSelfVerify] = createSignal(false)
  const [maxTurns, setMaxTurns] = createSignal(0)
  const [webSearchEnabled, setWebSearchEnabled] = createSignal(true)
  const [autoLearnEnabled, setAutoLearnEnabled] = createSignal(false)
  const [autoLearnInterval, setAutoLearnInterval] = createSignal(10)
  const [autoLearnModel, setAutoLearnModel] = createSignal("")
  const [autoLearnStatus, setAutoLearnStatus] = createSignal("Disabled")
  const [goal, setGoal] = createSignal<WorkspaceGoal | null>(null)
  let messagesElement: HTMLDivElement | undefined
  let scrollFrame = 0
  let eventFrame = 0
  let pendingEvents: TaskLog[] = []
  let unsubscribeBackend = () => {}
  let unsubscribeMenu = () => {}
  let backendWasAvailable = false

  const mergeLogs = (target: TaskLog[], incoming: TaskLog[]): TaskLog[] => {
    if (!incoming.length) return target
    const next = target.slice()
    for (const log of incoming) {
      const previous = next[next.length - 1]
      if (previous?.kind === log.kind) next[next.length - 1] = { ...previous, content: previous.content + log.content }
      else next.push(log)
    }
    return next
  }

  const flushBackendEvents = () => {
    if (eventFrame) cancelAnimationFrame(eventFrame)
    eventFrame = 0
    if (!pendingEvents.length) return
    const batch = pendingEvents
    pendingEvents = []
    setEvents((old) => mergeLogs(old, batch))
  }

  const queueBackendEvent = (log: TaskLog) => {
    pendingEvents = mergeLogs(pendingEvents, [log])
    if (!eventFrame) eventFrame = requestAnimationFrame(flushBackendEvents)
  }

  createEffect(() => {
    messages(); events()
    cancelAnimationFrame(scrollFrame)
    scrollFrame = requestAnimationFrame(() => {
      if (messagesElement) messagesElement.scrollTop = messagesElement.scrollHeight
    })
  })

  onCleanup(() => {
    cancelAnimationFrame(scrollFrame)
    cancelAnimationFrame(eventFrame)
    unsubscribeBackend()
    unsubscribeMenu()
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
  const goalKey = (root = workspace()) => `goal.${encodeURIComponent(root)}`
  const loadGoal = async (root: string) => setGoal((await window.api.store.get<WorkspaceGoal>(goalKey(root))) ?? null)
  const saveGoal = async (next: WorkspaceGoal | null) => {
    setGoal(next)
    if (!workspace()) return
    if (next) await window.api.store.set(goalKey(), next); else await window.api.store.delete(goalKey())
  }

  const slashMatches = () => matchingSlashCommands(prompt(), [
    ...DESKTOP_SLASH_COMMANDS,
    ...skills().map((skill) => ({ name: skill.name, description: skill.description || "Run Grok Build skill", usage: `/${skill.name} [instructions]` })),
  ])
  const selectableModels = () => [...new Set([
    ...catalog().models,
    ...providerSecrets().map((provider) => provider.modelId).filter(Boolean),
  ])]
  const refreshModelCatalog = async () => setCatalog(await window.api.backend.models())
  createEffect(() => {
    const available = props.backendStatus().available
    if (available && !backendWasAvailable) void refreshModelCatalog()
    backendWasAvailable = available
  })
  const modelPickerValue = () => moaEnabled() ? `__moa__:${moaCandidates()}` : model()
  const selectModelValue = async (value: string) => {
    if (value.startsWith("__moa__:")) {
      const count = Math.min(10, Math.max(2, Number(value.split(":")[1]) || 3))
      setMoaEnabled(true); setMoaCandidates(count)
      setMoaReferenceModels((current) => Array.from({ length: count }, (_, index) => current[index] || model() || catalog().defaultModel || catalog().models[0] || ""))
      await window.api.store.set("moa.enabled", true); await window.api.store.set("moa.candidates", count)
    } else {
      setMoaEnabled(false); setModel(value)
      await window.api.store.set("moa.enabled", false); await window.api.store.set("defaults.model", value)
    }
  }
  const setToggle = (argument: string, current: boolean) => argument === "on" ? true : argument === "off" ? false : !current
  const executeSlashCommand = async (input: string): Promise<boolean> => {
    const parsed = parseSlashCommand(input)
    if (!parsed) return false
    const command = DESKTOP_SLASH_COMMANDS.find((entry) => entry.name === parsed.name || entry.aliases?.includes(parsed.name))
    if (!command) return false
    setSlashNotice("")
    if (command.name === "help") setSlashNotice(DESKTOP_SLASH_COMMANDS.map((entry) => `/${entry.name} — ${entry.description}`).join("\n"))
    else if (command.name === "new") { await saveConversation([]); setEvents([]); setQueuedPrompts([]); setSlashNotice("Started a new chat") }
    else if (command.name === "model") {
      const found = selectableModels().find((entry) => entry === parsed.args)
      const moaMatch = parsed.args.match(/^moa(?::(\d+))?$/i)
      if (!parsed.args) setSlashNotice(`Current model: ${moaEnabled() ? `MoA ×${moaCandidates()} (${model() || "Grok Build default"})` : model() || "Grok Build default"}`)
      else if (moaMatch) { const count = Math.min(10, Math.max(2, Number(moaMatch[1]) || 3)); await selectModelValue(`__moa__:${count}`); setSlashNotice(`Model set to Mixture of Agents ×${count}`) }
      else if (found) { await selectModelValue(found); setSlashNotice(`Model set to ${found}`) }
      else setSlashNotice(`Unknown model: ${parsed.args}`)
    } else if (command.name === "think") { const next = setToggle(parsed.args, thinking()); setThinking(next); setSlashNotice(`Reasoning ${next ? "enabled" : "disabled"}`) }
    else if (command.name === "approve") { const next = setToggle(parsed.args, autoApprove()); setAutoApprove(next); setSlashNotice(`Automatic approval ${next ? "enabled" : "disabled"}`) }
    else if (command.name === "moa") {
      if (parsed.args === "off") { setMoaEnabled(false); await window.api.store.set("moa.enabled", false); setSlashNotice("Mixture of Agents disabled") }
      else {
        const requested = Number(parsed.args || moaCandidates())
        const count = Number.isFinite(requested) ? Math.min(10, Math.max(2, Math.floor(requested))) : moaCandidates()
        setMoaCandidates(count); setMoaEnabled(true)
        await window.api.store.set("moa.candidates", count); await window.api.store.set("moa.enabled", true)
        setSlashNotice(`Mixture of Agents enabled with ${count} candidates`)
      }
    }
    else if (command.name === "goal") {
      const action = parsed.args.toLowerCase()
      const current = goal()
      if (!parsed.args || action === "status") setSlashNotice(current ? `Goal: ${current.objective}\nStatus: ${current.status} · ${current.iterations} run${current.iterations === 1 ? "" : "s"}` : "No goal is set for this workspace")
      else if (action === "clear") { await saveGoal(null); setSlashNotice("Workspace goal cleared") }
      else if (action === "pause" || action === "resume" || action === "done" || action === "complete") {
        if (!current) setSlashNotice("No workspace goal is set")
        else { const status = action === "pause" ? "paused" : action === "resume" ? "active" : "completed"; await saveGoal({ ...current, status, updatedAt: Date.now() }); setSlashNotice(`Goal ${status}`) }
      } else {
        const next: WorkspaceGoal = { objective: parsed.args, status: "active", iterations: 0, createdAt: Date.now(), updatedAt: Date.now() }
        await saveGoal(next); setSlashNotice(`Goal set: ${parsed.args}`)
        queueMicrotask(() => void run(`Begin working toward this goal: ${parsed.args}`))
      }
    }
    else if (command.name === "learn") {
      const conversation = messages().map((message) => ({ role: message.role, text: message.logs.map((log) => log.content).join("\n") }))
      const learnPrompt = buildLearnPrompt(parsed.args, conversation)
      setSlashNotice(parsed.args ? "Learning a reusable project skill from your sources…" : "Learning a reusable project skill from this conversation…")
      queueMicrotask(() => void run(learnPrompt))
    }
    else if (command.name === "preview") {
      const next = setToggle(parsed.args, previewOpen()); setPreviewEnabled(true); setPreviewOpen(next)
      await window.api.store.set("preview.enabled", true); setSlashNotice(`Preview ${next ? "opened" : "closed"}`)
    } else if (command.name === "stop") { await window.api.backend.cancel(); setSlashNotice("Stop requested") }
    else {
      const destinations: Record<string, string> = { workspace: "workspace", terminal: "terminal", review: "review", skills: "skills", runs: "runs", scheduled: "scheduled", settings: "settings" }
      const destination = destinations[command.name]
      if (destination) await navigate(destination)
    }
    setPrompt(""); setSlashSelection(0)
    return true
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
      await loadGoal(current.path)
    }
    setTelegram(await window.api.telegram.status())
    setTelegramAllowedChats((await window.api.telegram.allowedChats()).join(", "))
    setTelegramPendingChats(await window.api.telegram.pendingChats())
    setRuns(await window.api.grokRuns.list())
    setSkills(await window.api.skills.list(workspace()))
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
    const savedPreviewEnabled = (await window.api.store.get<boolean>("preview.enabled")) ?? false
    const savedPreviewURL = (await window.api.store.get<string>("preview.url")) || "http://localhost:3000"
    setPreviewEnabled(savedPreviewEnabled); setPreviewOpen(savedPreviewEnabled); setPreviewURL(savedPreviewURL); setPreviewDraft(savedPreviewURL)
    if (savedPreviewEnabled && current?.path) {
      try {
        const result = await window.api.preview.start(current.path)
        setPreviewURL(result.url); setPreviewDraft(result.url); setPreviewStatus("Built-in preview")
      } catch (error) {
        setPreviewStatus(error instanceof Error ? error.message : String(error))
        setPreviewOpen(false)
      }
    }
    setMoaEnabled((await window.api.store.get<boolean>("moa.enabled")) ?? false)
    setMoaCandidates(Math.min(10, Math.max(2, (await window.api.store.get<number>("moa.candidates")) || 3)))
    const savedReferences = (await window.api.store.get<string[]>("moa.referenceModels")) ?? []
    setMoaReferenceModels(savedReferences.length ? savedReferences : Array.from({ length: Math.min(10, Math.max(2, (await window.api.store.get<number>("moa.candidates")) || 3)) }, () => catalog().defaultModel || catalog().models[0] || ""))
    setMoaAggregatorModel((await window.api.store.get<string>("moa.aggregatorModel")) || catalog().defaultModel || "")
    setThinking((await window.api.store.get<boolean>("defaults.thinking")) ?? true)
    setAutoApprove((await window.api.store.get<boolean>("defaults.autoApprove")) ?? false)
    setSelfVerify((await window.api.store.get<boolean>("defaults.selfVerify")) ?? false)
    setMaxTurns(Math.min(100, Math.max(0, (await window.api.store.get<number>("defaults.maxTurns")) || 0)))
    setAutoLearnEnabled((await window.api.store.get<boolean>("autoLearn.enabled")) ?? false)
    setAutoLearnInterval(Math.min(50, Math.max(1, (await window.api.store.get<number>("autoLearn.interval")) || 10)))
    setAutoLearnModel((await window.api.store.get<string>("autoLearn.model")) || "")
    setAutoLearnStatus((await window.api.store.get<string>("autoLearn.lastStatus")) || "No review has run yet")
    setWebSearchEnabled((await window.api.store.get<boolean>("defaults.webSearch")) ?? true)
    setAgentAppControls((await window.api.store.get<boolean>("agent.appControls")) ?? false)
    setSubagentsEnabled((await window.api.store.get<boolean>("agent.subagents")) ?? true)
    setDelegationMode((await window.api.store.get<"balanced" | "aggressive">("agent.delegationMode")) ?? "balanced")
    const savedModel = await window.api.store.get<string>("defaults.model")
    if (savedModel && selectableModels().includes(savedModel)) setModel(savedModel)
    unsubscribeBackend = window.api.backend.onEvent((event: BackendEvent) => {
      if (event.type === "text" && event.data) queueBackendEvent({ kind: "text", content: event.data })
      if (event.type === "thought" && event.data) queueBackendEvent({ kind: "thought", content: event.data })
      if (event.type === "error" && event.message) queueBackendEvent({ kind: "error", content: event.message })
    })
    unsubscribeMenu = window.api.onMenuCommand((command) => {
      if (command === "new-task") {
        setActive("new-task")
        void saveConversation([]).then(() => setEvents([]))
      } else if (command === "open-project") void chooseWorkspace()
      else if (command === "grok-status") {
        setActive("new-task")
        setSlashNotice(props.backendStatus().available ? `Grok Build ready · ${props.backendStatus().version || props.backendStatus().command}` : props.backendStatus().error || "Grok Build unavailable")
      } else if (command === "lmstudio-settings") void navigate("runtime")
      else if (command === "about") {
        setActive("settings")
        setSlashNotice("Grok Build Desktop")
      }
    })
  })

  const chooseWorkspace = async () => {
    const result = await window.api.dialog.openDirectory()
    if (!result.canceled && result.filePaths[0]) {
      const project = await window.api.projects.add(result.filePaths[0])
      setSelectedProject(project)
      setWorkspace(project.path)
      setProjects((current) => [project, ...current.filter((entry) => entry.id !== project.id)])
      await window.api.store.set("workspace.last", project.path)
      await loadProject(project)
    }
  }

  const useScratchWorkspace = async () => {
    const scratch = await window.api.projects.scratch()
    setSelectedProject(scratch)
    setWorkspace(scratch.path)
    setProjects((current) => [scratch, ...current.filter((entry) => entry.id !== scratch.id)])
    await window.api.store.set("workspace.last", scratch.path)
    await loadProject(scratch)
  }

  const maybeAutoLearn = async () => {
    if (!autoLearnEnabled() || !workspace()) return
    const key = `autoLearn.turns.${encodeURIComponent(workspace())}`
    const turns = ((await window.api.store.get<number>(key)) || 0) + 1
    if (turns < autoLearnInterval()) {
      await window.api.store.set(key, turns)
      const remaining = autoLearnInterval() - turns
      setAutoLearnStatus(`Next review in ${remaining} completed turn${remaining === 1 ? "" : "s"}`)
      return
    }
    await window.api.store.set(key, 0)
    const conversation = messages().map((message) => ({ role: message.role, text: message.logs.map((log) => log.content).join("\n") }))
    setAutoLearnStatus("Background review running…")
    void window.api.backend.autoLearn({ prompt: buildAutoLearnPrompt(conversation), cwd: workspace(), model: autoLearnModel() || model() || undefined })
      .then(async () => {
        const status = `Last review completed ${new Date().toLocaleString()}`
        setAutoLearnStatus(status); await window.api.store.set("autoLearn.lastStatus", status)
        setSkills(await window.api.skills.list(workspace()))
      })
      .catch(async (error) => {
        const status = `Last review failed: ${error instanceof Error ? error.message : String(error)}`
        setAutoLearnStatus(status); await window.api.store.set("autoLearn.lastStatus", status)
      })
  }

  const run = async (requested?: string) => {
    const submitted = (requested ?? prompt()).trim()
    if (!submitted) return
    if (await executeSlashCommand(submitted)) return
    if (running()) {
      setQueuedPrompts((old) => [...old, { id: crypto.randomUUID(), text: submitted }])
      setPrompt(""); setHistoryIndex(-1)
      return
    }
    setPrompt(""); setEvents([]); setRunning(true)
    try {
      let runWorkspace = workspace()
      if (!runWorkspace) {
        const scratch = await window.api.projects.scratch()
        setProjects((current) => current.some((project) => project.path === scratch.path) ? current : [scratch, ...current])
        setSelectedProject(scratch)
        setWorkspace(scratch.path)
        runWorkspace = scratch.path
        await window.api.store.set("workspace.last", scratch.path)
        await loadConversation(scratch.path)
        await loadGoal(scratch.path)
      }
      await saveConversation([...messages(), { id: crypto.randomUUID(), role: "user", logs: [{ kind: "text", content: submitted }], createdAt: Date.now() }])
      const activeGoal = goal()?.status === "active" ? goal() : null
      let executionPrompt = activeGoal ? `## Durable workspace goal\n${activeGoal.objective}\n\n## Current instruction\n${submitted}\n\nMake concrete progress toward the durable goal, verify your work, and report remaining work clearly.` : submitted
      if (agentAppControls()) {
        executionPrompt += `\n\n## Desktop host controls\nYou may control safe app features by ending your response with one or more exact action tags. Use only when useful:\n<app_action>{"type":"preview.open"}</app_action>\n<app_action>{"type":"schedule.create","name":"Task name","prompt":"Task prompt","runAt":1770000000000,"repeatMinutes":60}</app_action>\nThese actions are schema-validated by the host. Never place shell commands or secrets in an action.`
        if (previewOpen()) {
          try {
            const inspection = await window.api.preview.inspect()
            executionPrompt += `\n\n## Live rendered preview\nYou can inspect the current rendered page below and may use the screenshot with your image-reading tools. Re-check your source files before editing.\nURL: ${inspection.url}\nTitle: ${inspection.title}\nViewport: ${inspection.viewport.width}x${inspection.viewport.height}\nScreenshot: ${inspection.screenshotPath}\nInteractive controls: ${JSON.stringify(inspection.controls)}\nLinks: ${JSON.stringify(inspection.links)}\nRendered text:\n${inspection.text}\n\nRendered DOM snapshot:\n${inspection.html}`
          } catch (error) {
            executionPrompt += `\n\n## Live rendered preview\nPreview inspection is currently unavailable: ${error instanceof Error ? error.message : String(error)}`
          }
        }
      }
      if (subagentsEnabled()) {
        executionPrompt += delegationMode() === "aggressive"
          ? `\n\n## Subagent delegation\nUse Grok Build subagents proactively for independent research, code inspection, testing, and rendered-preview review. Parallelize bounded non-overlapping work, keep one primary agent responsible for integration, and verify every delegated result before applying it. Do not delegate trivial work or let multiple agents edit the same files.`
          : `\n\n## Subagent delegation\nUse Grok Build subagents when two or more independent workstreams would materially improve speed or quality (for example code inspection plus tests, or implementation plus rendered-preview review). Keep one primary integrator, avoid overlapping edits, and verify delegated results.`
      }
      const references = moaReferenceModels().slice(0, moaCandidates()).filter(Boolean)
      await window.api.backend.run({ prompt: executionPrompt, cwd: runWorkspace, model: model() || undefined, thinking: thinking(), autoApprove: autoApprove(), bestOfN: moaEnabled() && references.length < 2 ? moaCandidates() : undefined, moa: moaEnabled() && references.length >= 2 ? { referenceModels: references, aggregatorModel: moaAggregatorModel() || model() || undefined } : undefined, selfVerify: selfVerify() || Boolean(activeGoal), maxTurns: maxTurns() || undefined, disableWebSearch: !webSearchEnabled(), subagents: subagentsEnabled() })
      if (activeGoal) await saveGoal({ ...activeGoal, iterations: activeGoal.iterations + 1, updatedAt: Date.now() })
    } catch (error) {
      queueBackendEvent({ kind: "error", content: (error as Error).message })
    } finally {
      flushBackendEvents()
      setRunning(false)
      const completed = splitThinking(events())
      if (agentAppControls()) {
        const text = completed.map((entry) => entry.content).join("\n")
        for (const match of text.matchAll(/<app_action>(\{[^<]+\})<\/app_action>/g)) {
          try {
            const action = JSON.parse(match[1]) as { type?: string; name?: string; prompt?: string; runAt?: number; repeatMinutes?: number }
            if (action.type === "preview.open" && workspace()) {
              const result = await window.api.preview.start(workspace())
              setPreviewEnabled(true); setPreviewOpen(true); setPreviewURL(result.url); setPreviewDraft(result.url); setPreviewStatus("Built-in preview")
            } else if (action.type === "schedule.create" && action.name?.trim() && action.prompt?.trim() && Number.isFinite(action.runAt) && action.runAt! > Date.now()) {
              await window.api.schedules.add({ name: action.name.slice(0, 120), prompt: action.prompt.slice(0, 20_000), cwd: workspace(), model: model() || undefined, runAt: action.runAt!, repeatMinutes: action.repeatMinutes && action.repeatMinutes >= 1 ? Math.min(action.repeatMinutes, 525_600) : undefined })
            }
          } catch { /* Invalid model actions are ignored instead of gaining app authority. */ }
        }
      }
      if (completed.length) await saveConversation([...messages(), { id: crypto.randomUUID(), role: "assistant", logs: completed, createdAt: Date.now() }])
      setEvents([])
    }
    setRuns(await window.api.grokRuns.list())
    setSkills(await window.api.skills.list(workspace()))
    if (!submitted.startsWith("[/learn]")) await maybeAutoLearn()
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
    const result = await window.api.workspace.command(workspace(), command); const output = result.stdout + result.stderr
    setTerminalOutput((old) => old + output + `\n[exit ${result.code}]\n`); setTerminalRunning(false)
    const detected = output.match(/https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?(?:\/[^\s]*)?/i)?.[0]
    if (detected && previewEnabled()) {
      const url = detected.replace("0.0.0.0", "127.0.0.1")
      setPreviewURL(url); setPreviewDraft(url); setPreviewOpen(true); setPreviewStatus("Detected dev server")
      await window.api.store.set("preview.url", url)
    }
  }
  const refreshDiff = async (root = workspace()) => { if (root) { setGitChanges(await window.api.workspace.gitChanges(root)); setSelectedDiff(""); setDiffContent("") } }

  const loadProject = async (project: ProjectSnapshot) => {
    setOpenFile(""); setFileContent(""); setFileNotice(""); setSelectedDiff(""); setDiffContent("")
    if (active() === "workspace") await refreshFiles(project.path)
    if (active() === "review") await refreshDiff(project.path)
    if (active() === "skills") setSkills(await window.api.skills.list(project.path))
    await loadConversation(project.path)
    await loadGoal(project.path)
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
        <Show when={projects().length > 0} fallback={<><button class="sidebar__project" onClick={useScratchWorkspace}>Start agent scratch</button><button class="sidebar__project" onClick={chooseWorkspace}>Add a codebase</button></>}>
          <For each={projects()}>{(project) => <button class={`sidebar__project ${selectedProject()?.id === project.id ? "sidebar__project--active" : ""}`} onClick={() => void selectProject(project)}><span class="project-name">{project.name}</span><Show when={project.changedFiles > 0}><span class="project-changes">{project.changedFiles}</span></Show></button>}</For>
        </Show>
      </div>
      <div class="sidebar__footer">
        <span class={`status-dot ${props.backendStatus().available ? "status-dot--ready" : ""}`} />
        <span>{props.backendStatus().available ? "Grok Build ready" : "Grok Build unavailable"}</span>
      </div>
    </aside>

    <main class={`main-content ${active() === "new-task" && previewEnabled() && previewOpen() ? "main-content--preview" : ""}`}>
      <Show when={active() === "review"} fallback={
      <Show when={active() === "workspace"} fallback={
      <Show when={active() === "terminal"} fallback={
      <Show when={active() === "skills"} fallback={
      <Show when={active() === "scheduled"} fallback={
      <Show when={active() === "settings"} fallback={
      <Show when={active() === "telegram"} fallback={
        <Show when={active() === "runtime"} fallback={
        <Show when={active() === "runs"} fallback={<>
        <div class={`chat-workbench ${previewEnabled() && previewOpen() ? "chat-workbench--preview" : ""}`}><div class="chat-column"><section class="chat-thread">
          <header class="chat-header"><div><strong>{selectedProject()?.name || "Scratch"}</strong><span>{selectedProject()?.isGit ? `${selectedProject()?.branch} · ${selectedProject()?.changedFiles} changed` : "Grok Build workspace"}</span></div><div class="chat-header__actions"><Show when={previewEnabled()}><button class={previewOpen() ? "active" : ""} onClick={async () => { if (!previewOpen() && workspace()) { try { const result = await window.api.preview.start(workspace()); setPreviewURL(result.url); setPreviewDraft(result.url); setPreviewStatus("Built-in preview") } catch (error) { setPreviewStatus((error as Error).message) } } setPreviewOpen(!previewOpen()) }}>◫ Preview</button></Show><button onClick={async () => { await saveConversation([]); setEvents([]) }}>New chat</button><button onClick={useScratchWorkspace}>Agent scratch</button><button onClick={chooseWorkspace}>Open project</button></div></header>
          <div class="chat-messages" ref={messagesElement}>
            <Show when={messages().length || running()} fallback={<div class="chat-empty"><span class="chat-empty__mark">✦</span><h1>What do you want to build?</h1><p>Ask Grok Build to create, debug, explain, or change code.</p><div><button onClick={() => setPrompt("Review this codebase and suggest the highest-impact improvements.")}>Review this project</button><button onClick={() => setPrompt("Find and fix the most important bug in this codebase.")}>Fix a bug</button><button onClick={() => setPrompt("Add tests for the most critical untested behavior.")}>Add tests</button></div></div>}>
              <For each={messages()}>{(message) => <article class={`chat-message chat-message--${message.role}`}><div class="chat-avatar">{message.role === "assistant" ? "✦" : "You"}</div><div class="chat-message__body"><For each={splitThinking(message.logs)}>{(entry) => <Show when={entry.kind !== "thought"} fallback={<details class="reasoning"><summary>Thought process</summary><pre>{entry.content}</pre></details>}><pre class={entry.kind === "error" ? "chat-error" : ""}>{entry.content}</pre></Show>}</For><div class="message-actions"><span>{new Date(message.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span><button onClick={() => navigator.clipboard.writeText(message.logs.map((log) => log.content).join("\n"))}>Copy</button><Show when={message.role === "assistant"}><button onClick={() => { const previous = messages().slice(0, messages().findIndex((entry) => entry.id === message.id)).reverse().find((entry) => entry.role === "user"); if (previous) setPrompt(previous.logs.map((log) => log.content).join("\n")) }}>Retry</button></Show></div></div></article>}</For>
              <Show when={running()}><article class="chat-message chat-message--assistant"><div class="chat-avatar">✦</div><div class="chat-message__body"><Show when={events().length} fallback={<div class="typing-indicator"><i/><i/><i/></div>}><For each={splitThinking(events())}>{(entry) => <Show when={entry.kind !== "thought"} fallback={<details class="reasoning"><summary>Thinking…</summary><pre>{entry.content}</pre></details>}><pre class={entry.kind === "error" ? "chat-error" : ""}>{entry.content}</pre></Show>}</For></Show></div></article></Show>
            </Show>
          </div>
        </section>
        <Show when={goal()}>{(currentGoal) => <section class={`goal-banner goal-banner--${currentGoal().status}`}><div><span>GOAL · {currentGoal().status}</span><strong>{currentGoal().objective}</strong><small>{currentGoal().iterations} progress run{currentGoal().iterations === 1 ? "" : "s"}</small></div><div><Show when={currentGoal().status === "active"}><button onClick={() => void run("Continue making the highest-impact progress toward the active goal.")}>Continue</button><button onClick={() => void executeSlashCommand("/goal pause")}>Pause</button></Show><Show when={currentGoal().status === "paused"}><button onClick={() => void executeSlashCommand("/goal resume")}>Resume</button></Show><Show when={currentGoal().status !== "completed"}><button onClick={() => void executeSlashCommand("/goal done")}>Complete</button></Show><button onClick={() => void executeSlashCommand("/goal clear")}>Clear</button></div></section>}</Show>
        <Show when={queuedPrompts().length}><section class="prompt-queue"><span>Queued</span><For each={queuedPrompts()}>{(entry, index) => <div><b>{index() + 1}</b><p>{entry.text}</p><button onClick={() => setQueuedPrompts((old) => old.filter((item) => item.id !== entry.id))}>×</button></div>}</For></section></Show>
        <section class="chat-composer chat-composer--docked" aria-label="Grok Build task composer">
          <div class="chat-composer__context">
            <button class="context-pill" onClick={chooseWorkspace} title={workspace()}><span class="context-pill__icon">⌘</span>{selectedProject()?.name || "Scratch"}</button>
            <span class="composer-hint">Grok Build can read and edit this workspace</span>
          </div>
          <Show when={slashMatches().length}><div class="slash-palette"><For each={slashMatches()}>{(command, index) => <button class={index() === slashSelection() ? "active" : ""} onMouseDown={(event) => { event.preventDefault(); setPrompt(`/${command.name}${command.usage?.includes("<") ? " " : ""}`); setSlashSelection(0) }}><code>/{command.name}</code><span>{command.description}</span><Show when={command.usage}><small>{command.usage}</small></Show></button>}</For></div></Show>
          <Show when={slashNotice()}><pre class="slash-notice">{slashNotice()}</pre></Show>
          <textarea value={prompt()} onInput={(event) => { setPrompt(event.currentTarget.value); setHistoryIndex(-1); setSlashSelection(0); if (event.currentTarget.value) setSlashNotice("") }} onKeyDown={(event) => { const matches = slashMatches(); if (matches.length && event.key === "ArrowDown") { event.preventDefault(); setSlashSelection((value) => (value + 1) % matches.length) } else if (matches.length && event.key === "ArrowUp") { event.preventDefault(); setSlashSelection((value) => (value - 1 + matches.length) % matches.length) } else if (matches.length && (event.key === "Tab" || event.key === "Enter") && !event.shiftKey) { event.preventDefault(); const command = matches[slashSelection()]; if (command) { const requiresArgs = command.usage?.includes("<"); setPrompt(`/${command.name}${requiresArgs ? " " : ""}`); setSlashSelection(0); if (!requiresArgs && event.key === "Enter") void run(`/${command.name}`) } } else if (event.key === "Enter" && !event.shiftKey && !event.isComposing) { event.preventDefault(); void run() } else if (event.key === "ArrowUp" && (event.currentTarget.selectionStart === 0 || !prompt())) { event.preventDefault(); browsePromptHistory(-1) } else if (event.key === "ArrowDown" && event.currentTarget.selectionStart === prompt().length) { event.preventDefault(); browsePromptHistory(1) } }} placeholder={running() ? "Send another instruction — it will be queued…" : "Ask Grok Build to code, debug, or type / for commands…"} rows={3} />
          <div class="chat-composer__footer">
            <button class="composer-icon" onClick={chooseWorkspace} title="Attach or open a workspace">＋</button>
            <label class={`composer-toggle ${thinking() ? "composer-toggle--active" : ""}`} title="Use high reasoning effort"><input type="checkbox" checked={thinking()} onChange={async (event) => { setThinking(event.currentTarget.checked); await window.api.store.set("defaults.thinking", event.currentTarget.checked) }} />◇ Think</label>
            <label class={`composer-toggle ${autoApprove() ? "composer-toggle--warning" : ""}`} title="Allow Grok Build to execute tools without asking"><input type="checkbox" checked={autoApprove()} onChange={async (event) => { setAutoApprove(event.currentTarget.checked); await window.api.store.set("defaults.autoApprove", event.currentTarget.checked) }} />⚡ Auto</label>
            <label class={`composer-toggle ${moaEnabled() ? "composer-toggle--moa" : ""}`} title={`Run ${moaCandidates()} candidates in parallel and synthesize the best result`}><input type="checkbox" checked={moaEnabled()} onChange={async (event) => { setMoaEnabled(event.currentTarget.checked); await window.api.store.set("moa.enabled", event.currentTarget.checked) }} />⌘ MoA ×{moaCandidates()}</label>
            <select class="composer-model" value={modelPickerValue()} onFocus={() => void refreshModelCatalog()} onChange={(event) => void selectModelValue(event.currentTarget.value)} aria-label="Model">
              <optgroup label="Mixture of Agents"><option value="__moa__:2">MoA · Fast ×2</option><option value="__moa__:3">MoA · Balanced ×3</option><option value="__moa__:5">MoA · Thorough ×5</option><option value="__moa__:8">MoA · Exhaustive ×8</option><Show when={![2,3,5,8].includes(moaCandidates())}><option value={`__moa__:${moaCandidates()}`}>MoA · Custom ×{moaCandidates()}</option></Show></optgroup>
              <optgroup label="Single model">
              <option value="">{catalog().defaultModel || "Default model"}</option>
              <For each={selectableModels()}>{(entry) => <option value={entry}>{entry}</option>}</For>
              </optgroup>
            </select>
            <button class="composer-send" disabled={!prompt().trim()} onClick={() => void run()} title={running() ? "Queue instruction (Enter)" : "Send (Enter)"}>{running() ? "+" : "↑"}</button>
            <Show when={running()}><button class="composer-stop" onClick={() => window.api.backend.cancel()} title="Stop current task"><span /></button></Show>
          </div>
        </section>
        </div><Show when={previewEnabled() && previewOpen()}><aside class="preview-rail"><header><div><strong>Preview</strong><span>{previewStatus()}</span></div><div class="preview-actions"><button class={previewDevice() === "desktop" ? "active" : ""} onClick={() => setPreviewDevice("desktop")} title="Desktop">▰</button><button class={previewDevice() === "tablet" ? "active" : ""} onClick={() => setPreviewDevice("tablet")} title="Tablet">▯</button><button class={previewDevice() === "mobile" ? "active" : ""} onClick={() => setPreviewDevice("mobile")} title="Mobile">▯</button><button onClick={() => setPreviewReload((value) => value + 1)} title="Reload">↻</button><button onClick={() => window.api.app.openExternal(previewURL())} title="Open in browser">↗</button><button onClick={() => setPreviewOpen(false)} title="Close preview">×</button></div></header><div class="preview-location"><input value={previewDraft()} onInput={(event) => setPreviewDraft(event.currentTarget.value)} onKeyDown={async (event) => { if (event.key === "Enter") { const value = previewDraft().trim(); if (/^https?:\/\//i.test(value)) { setPreviewURL(value); setPreviewReload((count) => count + 1); setPreviewStatus("Loading…"); await window.api.store.set("preview.url", value) } } }} /><button onClick={async () => { const value = previewDraft().trim(); if (/^https?:\/\//i.test(value)) { setPreviewURL(value); setPreviewReload((count) => count + 1); setPreviewStatus("Loading…"); await window.api.store.set("preview.url", value) } }}>Go</button></div><div class={`preview-viewport preview-viewport--${previewDevice()}`}><iframe src={`${previewURL()}${previewURL().includes("?") ? "&" : "?"}grok-preview-reload=${previewReload()}`} title="Coding preview" sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals allow-pointer-lock allow-presentation allow-downloads" onLoad={() => setPreviewStatus("Connected")} /></div></aside></Show></div>
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
          <Show when={!telegram().connected} fallback={<><div class="connected">Connected as @{telegram().username ?? "bot"} · listening for authorized chats</div><Show when={telegramPendingChats().length}><div class="settings-card"><strong>Pairing requests</strong><For each={telegramPendingChats()}>{(id) => <div class="token-row"><span>Chat {id}</span><button class="primary" onClick={async () => { const saved = await window.api.telegram.setAllowedChats([...telegramAllowedChats().split(/[\s,]+/).filter(Boolean), id]); setTelegramAllowedChats(saved.join(", ")); setTelegramPendingChats(await window.api.telegram.pendingChats()); setTelegramNotice(`Chat ${id} approved`) }}>Approve</button></div>}</For></div></Show><div class="provider-fields"><label>Allowed chat IDs<input value={telegramAllowedChats()} onInput={(event) => setTelegramAllowedChats(event.currentTarget.value)} placeholder="-1001234567890, 123456789" /></label><button class="primary" onClick={async () => { const ids = telegramAllowedChats().split(/[\s,]+/).filter(Boolean); const saved = await window.api.telegram.setAllowedChats(ids); setTelegramAllowedChats(saved.join(", ")); setTelegramPendingChats(await window.api.telegram.pendingChats()); setTelegramNotice(saved.length ? `Listening to ${saved.length} authorized chat${saved.length === 1 ? "" : "s"}` : "No chats are authorized yet") }}>Save allowlist</button></div><div class="token-row"><button onClick={async () => { const status = await window.api.telegram.status(); setTelegram(status); setTelegramPendingChats(await window.api.telegram.pendingChats()); setTelegramNotice(status.connected ? `Connection verified · bot ${status.botId}` : status.error || "Connection failed") }}>Test + refresh</button><button onClick={async () => { await window.api.telegram.disconnect(); setTelegram({ connected: false }); setTelegramNotice("") }}>Disconnect</button></div><Show when={telegramNotice()}><p class={telegram().connected ? "notice" : "notice notice--error"}>{telegramNotice()}</p></Show></>}>
            <div class="token-row"><input type="password" value={token()} onInput={(event) => setToken(event.currentTarget.value)} placeholder="123456:ABC…" /><button class="primary" disabled={!token().trim()} onClick={connectTelegram}>Connect bot</button></div>
            <Show when={telegramNotice()}><p class={telegram().connected ? "notice" : "notice notice--error"}>{telegramNotice()}</p></Show>
          </Show>
          <p class="telegram-note">The bot polls Telegram while this app is running. Messages from allowed chats become Grok Build tasks in the current workspace; results are sent back to the same chat. Unauthorized chats receive only their chat ID and cannot run tasks.</p>
        </section>
      </Show>
      }>
        <section class="runs-panel"><span class="eyebrow">GROK BUILD SETTINGS</span><h1>Backend, models, and providers.</h1><p>The maintained backend is your <button class="link-button" onClick={() => window.api.app.openExternal("https://github.com/Franzferdinan51/grok-build")}>Franzferdinan51/grok-build fork</button>, with xAI upstream sync preserved. Every provider remains a Grok Build model target.</p>
          <div class="settings-card"><strong>Grok Build CLI backend</strong><span>{props.backendStatus().version || "Select a locally built fork binary or a PATH command."}</span><div class="token-row"><input value={cliPath()} onInput={(e) => setCliPath(e.currentTarget.value)} placeholder="/path/to/grok or grok"/><button class="primary" onClick={async () => { const status = await window.api.backend.setPath(cliPath()); setCliNotice(status.available ? `Connected: ${status.version || status.command}` : status.error || "Unavailable"); if (status.available) setCatalog(await window.api.backend.models()) }}>Save + Probe</button></div><Show when={cliNotice()}><p class="provider-notice">{cliNotice()}</p></Show></div>
          <div class="settings-card"><div><strong>Provider sign-in</strong><span>Native Grok OAuth plus Hermes-managed subscription OAuth.</span></div><div class="provider-fields"><div><strong>xAI / Grok</strong><span>Official OAuth through the installed Grok CLI</span></div><button class="primary" onClick={async () => { try { const result = await window.api.backend.oauthLogin("xai"); setOauthNotice(result.message) } catch (error) { setOauthNotice(error instanceof Error ? error.message : String(error)) } }}>Sign in with xAI</button><div><strong>OpenAI Codex</strong><span>Hermes OAuth using a ChatGPT/Codex subscription</span></div><button onClick={async () => { try { const result = await window.api.backend.oauthLogin("openai"); setOauthNotice(result.message) } catch (error) { setOauthNotice(error instanceof Error ? error.message : String(error)) } }}>Sign in with OpenAI</button><div><strong>MiniMax</strong><span>Hermes browser OAuth for the MiniMax Coding Plan</span></div><button onClick={async () => { try { const result = await window.api.backend.oauthLogin("minimax"); setOauthNotice(result.message) } catch (error) { setOauthNotice(error instanceof Error ? error.message : String(error)) } }}>Sign in with MiniMax</button></div><Show when={oauthNotice()}><p class="provider-notice">{oauthNotice()}</p></Show><p class="provider-notice">xAI OAuth feeds Grok Build directly. OpenAI Codex and MiniMax OAuth are securely managed by Hermes and remain isolated from API-key storage; Grok Build still remains this app’s coding runtime.</p></div>
          <div class="settings-card"><div><strong>Mixture of Agents</strong><span>Hermes-inspired multi-candidate reasoning powered by Grok Build's native <code>--best-of-n</code>.</span></div><div class="moa-setting"><label class="settings-switch"><input type="checkbox" checked={moaEnabled()} onChange={async (event) => { setMoaEnabled(event.currentTarget.checked); await window.api.store.set("moa.enabled", event.currentTarget.checked) }} /><span />Enable MoA</label><label>Candidate agents<select value={moaCandidates()} onChange={async (event) => { const count = Number(event.currentTarget.value); setMoaCandidates(count); await window.api.store.set("moa.candidates", count) }}><For each={[2,3,4,5,6,8,10]}>{(count) => <option value={count}>{count}</option>}</For></select></label></div><p class="provider-notice">Each candidate independently tackles the task; Grok Build judges and synthesizes the strongest result. This costs roughly one model run per candidate, so it is off by default.</p></div>
          <div class="settings-card"><div><strong>Coding-agent defaults</strong><span>Hermes-style session defaults mapped directly to supported Grok Build flags.</span></div><div class="agent-defaults-grid"><label>Default model<select value={model()} onChange={async (event) => { setModel(event.currentTarget.value); await window.api.store.set("defaults.model", event.currentTarget.value) }}><option value="">{catalog().defaultModel || "Grok Build default"}</option><For each={catalog().models}>{(entry) => <option value={entry}>{entry}</option>}</For></select></label><label>Maximum turns<input type="number" min="0" max="100" value={maxTurns()} onInput={async (event) => { const value = Math.min(100, Math.max(0, Number(event.currentTarget.value) || 0)); setMaxTurns(value); await window.api.store.set("defaults.maxTurns", value) }} /><small>0 uses the CLI default</small></label><label class="settings-switch"><input type="checkbox" checked={thinking()} onChange={async (event) => { setThinking(event.currentTarget.checked); await window.api.store.set("defaults.thinking", event.currentTarget.checked) }} /><span />High reasoning</label><label class="settings-switch"><input type="checkbox" checked={selfVerify()} onChange={async (event) => { setSelfVerify(event.currentTarget.checked); await window.api.store.set("defaults.selfVerify", event.currentTarget.checked) }} /><span />Self-verify changes</label><label class="settings-switch"><input type="checkbox" checked={webSearchEnabled()} onChange={async (event) => { setWebSearchEnabled(event.currentTarget.checked); await window.api.store.set("defaults.webSearch", event.currentTarget.checked) }} /><span />Web search</label><label class="settings-switch settings-switch--warning"><input type="checkbox" checked={autoApprove()} onChange={async (event) => { setAutoApprove(event.currentTarget.checked); await window.api.store.set("defaults.autoApprove", event.currentTarget.checked) }} /><span />Automatic approvals</label></div><p class="provider-notice">Self-verify uses <code>--check</code>; turn limits use <code>--max-turns</code>; disabling web search uses <code>--disable-web-search</code>. Automatic approvals remain visibly marked because they reduce safety prompts.</p></div>
          <div class="settings-card"><div><strong>Native subagents</strong><span>Delegate independent work through Grok Build’s own subagent runtime.</span></div><div class="agent-defaults-grid"><label class="settings-switch"><input type="checkbox" checked={subagentsEnabled()} onChange={async (event) => { setSubagentsEnabled(event.currentTarget.checked); await window.api.store.set("agent.subagents", event.currentTarget.checked) }} /><span />Enable subagents</label><label>Delegation style<select value={delegationMode()} disabled={!subagentsEnabled()} onChange={async (event) => { const value = event.currentTarget.value as "balanced" | "aggressive"; setDelegationMode(value); await window.api.store.set("agent.delegationMode", value) }}><option value="balanced">Balanced</option><option value="aggressive">Proactive parallel</option></select></label></div><p class="provider-notice">Balanced delegates only when work splits cleanly. Proactive parallel asks research, testing, inspection, and preview-review agents to run concurrently while one primary agent integrates results. Disabling this passes Grok’s verified <code>--no-subagents</code> flag.</p></div>
          <div class="settings-card"><div><strong>Automatic learning</strong><span>Hermes-style background skill review after completed coding turns.</span></div><div class="agent-defaults-grid"><label class="settings-switch settings-switch--warning"><input type="checkbox" checked={autoLearnEnabled()} onChange={async (event) => { setAutoLearnEnabled(event.currentTarget.checked); await window.api.store.set("autoLearn.enabled", event.currentTarget.checked); setAutoLearnStatus(event.currentTarget.checked ? "Waiting for completed turns" : "Disabled") }} /><span />Enable auto-learn</label><label>Review interval<input type="number" min="1" max="50" value={autoLearnInterval()} onInput={async (event) => { const value = Math.min(50, Math.max(1, Number(event.currentTarget.value) || 10)); setAutoLearnInterval(value); await window.api.store.set("autoLearn.interval", value) }} /><small>Completed coding turns</small></label><label>Review model<select value={autoLearnModel()} onChange={async (event) => { setAutoLearnModel(event.currentTarget.value); await window.api.store.set("autoLearn.model", event.currentTarget.value) }}><option value="">Current/default model</option><For each={catalog().models}>{(entry) => <option value={entry}>{entry}</option>}</For></select></label></div><p class="provider-notice">{autoLearnStatus()}. When enabled, a quiet Grok Build review looks for corrections, reusable fixes, and incomplete skills. It may modify only <code>.grok/skills/**</code>; it skips weak lessons instead of creating junk. Disabled by default because reviews consume model usage and write project skills automatically.</p></div>
          <div class="settings-card"><div><strong>Live coding preview</strong><span>Dyad-style sandboxed right rail available while chatting.</span></div><div class="preview-setting"><label class="settings-switch"><input type="checkbox" checked={previewEnabled()} onChange={async (event) => { const enabled = event.currentTarget.checked; setPreviewEnabled(enabled); setPreviewOpen(enabled); await window.api.store.set("preview.enabled", enabled) }} /><span />Enable preview</label><input value={previewDraft()} onInput={(event) => setPreviewDraft(event.currentTarget.value)} placeholder="http://localhost:3000"/><button onClick={async () => { const value = previewDraft().trim(); if (/^https?:\/\//i.test(value)) { setPreviewURL(value); await window.api.store.set("preview.url", value) } }}>Save URL</button></div><p class="provider-notice">URLs printed by project terminal commands are detected automatically. The preview never starts or stops your dev server.</p></div>
          <div class="settings-card"><div><strong>Agent app controls</strong><span>Hermes/WebMCP-style typed actions plus live preview vision.</span></div><label class="settings-switch settings-switch--warning"><input type="checkbox" checked={agentAppControls()} onChange={async (event) => { setAgentAppControls(event.currentTarget.checked); await window.api.store.set("agent.appControls", event.currentTarget.checked) }} /><span />Allow safe app controls</label><p class="provider-notice">When Preview is open, the agent receives its rendered DOM, visible text, controls, links, viewport, and a fresh screenshot on every run. It may open preview or create schedules, but cannot click arbitrary UI, access credentials, or expand its permissions.</p></div>
          <div class="settings-card"><strong>Add another OpenAI-compatible provider</strong><div class="provider-fields"><label>Name<input value={customName()} onInput={(e) => setCustomName(e.currentTarget.value)} placeholder="Together AI" /></label><label>Base URL<input value={customURL()} onInput={(e) => setCustomURL(e.currentTarget.value)} placeholder="https://api.example.com/v1" /></label><label>Model ID<input value={customModel()} onInput={(e) => setCustomModel(e.currentTarget.value)} placeholder="coding-model" /></label><button onClick={addProvider}>Add provider</button></div></div>
          <For each={providerSecrets()}>{(provider) => <article class="settings-card"><div><strong>{provider.label}</strong><span>{provider.envKey}</span></div><div class="provider-fields"><label>Base URL<input value={endpointDrafts()[provider.id] || ""} onInput={(event) => setEndpointDrafts((old) => ({ ...old, [provider.id]: event.currentTarget.value }))} /></label><label>Model ID<input value={modelDrafts()[provider.id] || ""} onInput={(event) => setModelDrafts((old) => ({ ...old, [provider.id]: event.currentTarget.value }))} placeholder="e.g. my-coding-model" /></label><button onClick={() => saveProvider(provider.id)}>Save endpoint</button></div><div class="token-row"><input type="password" value={secretDrafts()[provider.id] || ""} onInput={(event) => setSecretDrafts((old) => ({ ...old, [provider.id]: event.currentTarget.value }))} placeholder={provider.configured ? "Credential configured" : "Paste API key (optional for local)"} /><button class="primary" onClick={() => saveSecret(provider.id)}>Save key</button><button onClick={async () => { const result = await window.api.providerSecrets.test(provider.id); setProviderNotices((old) => ({ ...old, [provider.id]: result.message })) }}>Test</button><Show when={provider.configured}><button onClick={async () => { await window.api.providerSecrets.remove(provider.id); setProviderSecrets(await window.api.providerSecrets.list()) }}>Remove key</button></Show><Show when={provider.id.startsWith("custom-")}><button onClick={async () => { await window.api.providers.remove(provider.id); setProviderSecrets(await window.api.providerSecrets.list()) }}>Delete provider</button></Show></div><Show when={providerNotices()[provider.id]}><p class="provider-notice">{providerNotices()[provider.id]}</p></Show></article>}</For>
          <div class="settings-card moa-model-studio"><div><strong>MoA model routing</strong><span>Hermes-style reference slots with a separate acting aggregator.</span></div><div class="moa-reference-list"><For each={Array.from({ length: moaCandidates() })}>{(_, index) => <label><span>Reference {index() + 1}</span><select value={moaReferenceModels()[index()] || ""} onChange={async (event) => { const next = [...moaReferenceModels()]; next[index()] = event.currentTarget.value; setMoaReferenceModels(next); await window.api.store.set("moa.referenceModels", next) }}><option value="">Grok Build default</option><For each={catalog().models}>{(entry) => <option value={entry}>{entry}</option>}</For></select></label>}</For></div><label class="moa-aggregator"><span>Aggregator · acting model</span><select value={moaAggregatorModel()} onChange={async (event) => { setMoaAggregatorModel(event.currentTarget.value); await window.api.store.set("moa.aggregatorModel", event.currentTarget.value) }}><option value="">Grok Build default</option><For each={catalog().models}>{(entry) => <option value={entry}>{entry}</option>}</For></select></label><p class="provider-notice">Reference models analyze independently in plan-only mode and cannot edit files. Their outputs stream into collapsed reasoning; the aggregator synthesizes them and performs the actual implementation.</p></div>
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
