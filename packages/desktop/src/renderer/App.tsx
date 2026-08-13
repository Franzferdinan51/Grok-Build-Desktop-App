import { createEffect, createSignal, For, Show, onCleanup, onMount } from "solid-js"
import type { Accessor } from "solid-js"
import DOMPurify from "dompurify"
import { marked } from "marked"
import type { BackendEvent, BackendStatus, TelegramStatus, TelegramChat, ProjectSnapshot, GrokRunRecord, LocalStudioSnapshot, GrokBuildModelCatalog, GrokBuildUpdateStatus, GrokSkill, ScheduledGrokTask, ProviderSecret, WorkspaceFile, StoredChatThread, StoredChatSummary, DuckbotMemoryStatus, OAuthStatusSnapshot } from "../preload"
import { ensurePublicCompletion, splitThinking, type TaskLog } from "./chat-utils"
import { DESKTOP_SLASH_COMMANDS, matchingSlashCommands, parseSlashCommand } from "./slash-commands"
import { buildAutoLearnPrompt, buildLearnPrompt } from "./learn-prompt"
import { checkpointFor, visibleConversationContext } from "./chat-context"
import { validateAppActions } from "./app-actions"
import { createConversationWriter } from "./conversation-save"
import { artifactContextKey, STORE_KEYS, queueStoreKey } from "./store-keys"
import { dequeuePrompt, describePromptQueue, enqueuePrompt, parsePromptQueue, removeQueuedPrompt, type QueuedPrompt } from "./prompt-queue"
import { lastUserInstruction, rewindLastTurn } from "./conversation-lifecycle"
import { buildPaletteItems, filterPaletteItems } from "./command-palette"
import { catalogModelOptions, groupedModelOptions } from "./provider-availability"
import { ADVANCED_DEFAULTS, FRIENDLY_DEFAULTS, resolveFriendlyDefaults, type AdvancedSettings, type SettingsTab } from "./settings-defaults"
import { frameWorkflowPrompt, parseWorkflowName, WORKFLOWS } from "./workflow-presets"
import { summarizeHarnessDoctor } from "./harness-doctor"
import { RunsPanel } from "./views/RunsPanel"
import { ProjectFileTree } from "./ProjectFileTree"
import { TaskInspector } from "./TaskInspector"
import { NotificationStack, type DesktopNotification } from "./NotificationStack"
import { ChatTerminalRail } from "./ChatTerminalRail"
import { ConversationSplitPane } from "./ConversationSplitPane"
import { formatAttachedPrompt, toggleAttachedFile } from "./attached-files"
import { BrowserAgentTab } from "./views/BrowserAgentTab"
import { WorkspacePanel } from "./views/WorkspacePanel"
import { TerminalPanel } from "./views/TerminalPanel"
import { ReviewPanel } from "./views/ReviewPanel"
import { SkillsPanel } from "./views/SkillsPanel"
import { ScheduledPanel } from "./views/ScheduledPanel"
import { RuntimePanel } from "./views/RuntimePanel"
import { TelegramConnectionPanel } from "./views/TelegramConnectionPanel"
import { SettingsPanel } from "./views/SettingsPanel"
import { ArtifactsPanel } from "./views/ArtifactsPanel"
import { collectArtifacts, type ArtifactRecord } from "./artifact-utils"
import { nextSessionRail, type SessionRailMode } from "./session-context-rail"
import { BROWSER_AGENT_DIRECTIVE_SCHEMA, BROWSER_AGENT_SYSTEM_PROMPT } from "./browser-agent-protocol"
import "./styles.css"
import "./preview-layout.css"
import "./project-files.css"
import "./task-inspector.css"
import "./notifications.css"
import "./chat-terminal.css"
import "./branding.css"
import "./context-rail.css"
import grokBuildLogo from "./assets/grok-build-logo.png"
import * as eventBuffer from "./event-buffer"
import "./artifacts.css"

type ChatMessage = { id: string; role: "user" | "assistant"; logs: TaskLog[]; createdAt: number }
type ChatThread = StoredChatThread & { messages: ChatMessage[] }
type WorkspaceGoal = { objective: string; status: "active" | "paused" | "completed"; iterations: number; createdAt: number; updatedAt: number }
type ArtifactContext = { selectedPath?: string; previewUrl?: string; updatedAt: number }
type ContextRailMode = Exclude<SessionRailMode, "review">
const MAX_LIVE_LOG_CHARS = eventBuffer.MAX_LIVE_LOG_CHARS
const MAX_LIVE_LOG_ENTRIES = eventBuffer.MAX_LIVE_LOG_ENTRIES
void MAX_LIVE_LOG_CHARS
void MAX_LIVE_LOG_ENTRIES

function RichText(props: { content: string }) {
  const html = () => DOMPurify.sanitize(marked.parse(props.content, { async: false }) as string)
  return <div class="rich-text" innerHTML={html()} onClick={(event) => {
    const anchor = (event.target as HTMLElement).closest("a")
    if (!anchor) return
    event.preventDefault()
    if (/^https?:\/\//i.test(anchor.href)) void window.api.app.openExternal(anchor.href)
  }} />
}

const NAV = [
  { id: "new-task", label: "New task", icon: "✦" },
  { id: "workspace", label: "Workspace", icon: "▤" },
  { id: "terminal", label: "Terminal", icon: ">_" },
  { id: "runs", label: "Grok runs", icon: "◴" },
  { id: "artifacts", label: "Artifacts", icon: "◇" },
  { id: "review", label: "Review", icon: "⌘" },
  { id: "skills", label: "Skills", icon: "◇" },
  { id: "scheduled", label: "Scheduled", icon: "◷" },
  { id: "runtime", label: "Local runtimes", icon: "▣" },
  { id: "telegram", label: "Agent", icon: "◈" },
  { id: "browser-agent", label: "Browser Agent", icon: "🌐" },
  { id: "settings", label: "Settings", icon: "⚙" },
]

export function App(props: { backendStatus: Accessor<BackendStatus> }) {
  const [prompt, setPrompt] = createSignal("")
  const [workspace, setWorkspace] = createSignal("")
  const [thinking, setThinking] = createSignal(FRIENDLY_DEFAULTS.thinking)
  const [autoApprove, setAutoApprove] = createSignal(FRIENDLY_DEFAULTS.autoApprove)
  const [running, setRunning] = createSignal(false)
  const [active, setActive] = createSignal("new-task")
  const [events, setEvents] = createSignal<TaskLog[]>([])
  const [messages, setMessages] = createSignal<ChatMessage[]>([])
  const [sessionId, setSessionId] = createSignal("")
  const [chatThreads, setChatThreads] = createSignal<ChatThread[]>([])
  const [activeThreadId, setActiveThreadId] = createSignal("")
  const [splitThread, setSplitThread] = createSignal<ChatThread | null>(null)
  const [splitOpen, setSplitOpen] = createSignal(false)
  const [historyOpen, setHistoryOpen] = createSignal(false)
  const [historySearch, setHistorySearch] = createSignal("")
  const [historyAllWorkspaces, setHistoryAllWorkspaces] = createSignal(false)
  const [historyResults, setHistoryResults] = createSignal<ChatThread[]>([])
  const [sessionIndex, setSessionIndex] = createSignal<StoredChatSummary[]>([])
  const [sessionSwitcherOpen, setSessionSwitcherOpen] = createSignal(false)
  const [sessionSwitcherIndex, setSessionSwitcherIndex] = createSignal(0)
  const [sessionSwitcherNotice, setSessionSwitcherNotice] = createSignal("")
  const [queuedPrompts, setQueuedPrompts] = createSignal<QueuedPrompt[]>([])
  const [paletteOpen, setPaletteOpen] = createSignal(false)
  const [paletteQuery, setPaletteQuery] = createSignal("")
  const [paletteSelection, setPaletteSelection] = createSignal(0)
  const [historyIndex, setHistoryIndex] = createSignal(-1)
  const [historyDraft, setHistoryDraft] = createSignal("")
  const [telegram, setTelegram] = createSignal<TelegramStatus>({ connected: false })
  const [token, setToken] = createSignal("")
  const [telegramNotice, setTelegramNotice] = createSignal("")
  const [telegramAllowedChats, setTelegramAllowedChats] = createSignal("")
  const [telegramPendingChats, setTelegramPendingChats] = createSignal<string[]>([])
  const [telegramInbox, setTelegramInbox] = createSignal<{ allowed: TelegramChat[]; pending: TelegramChat[] }>({ allowed: [], pending: [] })
  const [projects, setProjects] = createSignal<ProjectSnapshot[]>([])
  const [selectedProject, setSelectedProject] = createSignal<ProjectSnapshot | null>(null)
  const [runs, setRuns] = createSignal<GrokRunRecord[]>([])
  const [artifacts, setArtifacts] = createSignal<ArtifactRecord[]>([])
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
  const [files, setFiles] = createSignal<WorkspaceFile[]>([])
  const [attachedFiles, setAttachedFiles] = createSignal<WorkspaceFile[]>([])
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
  const [oauthStatus, setOauthStatus] = createSignal<OAuthStatusSnapshot>({
    providers: [
      { id: "xai", label: "xAI / Grok", signedIn: false, helperAvailable: true, detail: "Checking sign-in…" },
      { id: "openai", label: "OpenAI Codex", signedIn: false, helperAvailable: true, detail: "Checking sign-in…" },
      { id: "minimax", label: "MiniMax", signedIn: false, helperAvailable: true, detail: "Checking sign-in…" },
    ],
  })
  const [oauthBusy, setOauthBusy] = createSignal<"" | "xai" | "openai" | "minimax">("")
  const [settingsSearch, setSettingsSearch] = createSignal("")
  const [grokUpdate, setGrokUpdate] = createSignal<GrokBuildUpdateStatus | null>(null)
  const [grokAutoUpdate, setGrokAutoUpdate] = createSignal(FRIENDLY_DEFAULTS.autoUpdate)
  const [grokUpdateChannel, setGrokUpdateChannel] = createSignal<"stable" | "alpha">("stable")
  const [grokUpdateNotice, setGrokUpdateNotice] = createSignal("")
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
  const [sidebarCollapsed, setSidebarCollapsed] = createSignal(false)
  const [previewCollapsed, setPreviewCollapsed] = createSignal(false)
  const [filesOpen, setFilesOpen] = createSignal(false)
  const [filesRailCollapsed, setFilesRailCollapsed] = createSignal(false)
  const [inspectorOpen, setInspectorOpen] = createSignal(false)
  const [terminalRailOpen, setTerminalRailOpen] = createSignal(false)
  const [contextRailMode, setContextRailMode] = createSignal<ContextRailMode | null>(null)
  const [notifications, setNotifications] = createSignal<DesktopNotification[]>([])
  const [agentAppControls, setAgentAppControls] = createSignal(false)
  const [subagentsEnabled, setSubagentsEnabled] = createSignal(FRIENDLY_DEFAULTS.subagents)
  const [delegationMode, setDelegationMode] = createSignal<"balanced" | "aggressive">("balanced")
  const [slashSelection, setSlashSelection] = createSignal(0)
  const [slashNotice, setSlashNotice] = createSignal("")
  const [moaEnabled, setMoaEnabled] = createSignal(false)
  const [moaCandidates, setMoaCandidates] = createSignal(3)
  const [moaReferenceModels, setMoaReferenceModels] = createSignal<string[]>([])
  const [moaAggregatorModel, setMoaAggregatorModel] = createSignal("")
  const [moaReferenceEffort, setMoaReferenceEffort] = createSignal<"low" | "medium" | "high">("medium")
  const [moaAggregatorEffort, setMoaAggregatorEffort] = createSignal<"low" | "medium" | "high">("high")
  const [moaReferenceTokenBudget, setMoaReferenceTokenBudget] = createSignal(600)
  const [selfVerify, setSelfVerify] = createSignal(FRIENDLY_DEFAULTS.selfVerify)
  const [maxTurns, setMaxTurns] = createSignal(0)
  const [sessionIdleHours, setSessionIdleHours] = createSignal(0)
  const [memoryStatus, setMemoryStatus] = createSignal<DuckbotMemoryStatus | null>(null)
  const [telegramMemoryEnabled, setTelegramMemoryEnabled] = createSignal(false)
  const [webSearchEnabled, setWebSearchEnabled] = createSignal(true)
  const [autoLearnEnabled, setAutoLearnEnabled] = createSignal(false)
  const [autoLearnInterval, setAutoLearnInterval] = createSignal(10)
  const [autoLearnModel, setAutoLearnModel] = createSignal("")
  const [autoLearnStatus, setAutoLearnStatus] = createSignal("Disabled")
  const [goal, setGoal] = createSignal<WorkspaceGoal | null>(null)
  const [advanced, setAdvanced] = createSignal<AdvancedSettings>(ADVANCED_DEFAULTS)
  const [backendToolCommand, setBackendToolCommand] = createSignal("inspect --json")
  const [backendToolOutput, setBackendToolOutput] = createSignal("")
  const [backendToolRunning, setBackendToolRunning] = createSignal(false)
  const [settingsTab, setSettingsTab] = createSignal<SettingsTab>("essentials")
  const [agentTab, setAgentTab] = createSignal<"overview" | "runtime" | "sessions" | "memory" | "telegram" | "commands">("telegram")
  let messagesElement: HTMLDivElement | undefined
  let scrollFrame = 0
  let eventFrame = 0
  let pendingEvents: TaskLog[] = []
  let unsubscribeBackend = () => {}
  let unsubscribeMenu = () => {}
  let backendWasAvailable = false
  let userNearBottom = true
  let notificationId = 0
  const announce = (kind: DesktopNotification["kind"], title: string, message: string) => {
    const id = ++notificationId
    setNotifications((current) => [...current.slice(-2), { id, kind, title, message }])
    window.setTimeout(() => setNotifications((current) => current.filter((notice) => notice.id !== id)), 5000)
    if (kind === "success" || kind === "error") void window.api.app.notify({ kind, title, body: message })
  }
  // Per-thread + 250ms-debounced saves. Replaces the unbounded
  // `saveChain = saveChain.then(...)` that previously rewrote every
  // thread through IPC for every keystroke. `flush` runs in `onCleanup`
  // so the user never loses an unsaved edit when the window closes.
  const conversationWriter = createConversationWriter((thread) => window.api.conversations.save(thread))

  const mergeLogs = (target: TaskLog[], incoming: TaskLog[]): TaskLog[] => eventBuffer.mergeLogs(target, incoming)

  const flushBackendEvents = () => {
    if (eventFrame) cancelAnimationFrame(eventFrame)
    eventFrame = 0
    if (!pendingEvents.length) return
    // `pendingEvents` is treated as a coalesce-on-flush queue: each
    // push is O(1) (no recompute), and the merge runs at most once per
    // animation frame in `setEvents`. The previous implementation
    // recomputed `MAX_LIVE_LOG_CHARS` eviction on every token chunk.
    const batch = pendingEvents
    pendingEvents = []
    setEvents((old) => mergeLogs(old, batch))
  }

  const queueBackendEvent = (log: TaskLog) => {
    pendingEvents.push(log)
    if (!eventFrame) eventFrame = requestAnimationFrame(flushBackendEvents)
  }

  createEffect(() => {
    messages(); events()
    cancelAnimationFrame(scrollFrame)
    scrollFrame = requestAnimationFrame(() => {
      if (messagesElement && userNearBottom) messagesElement.scrollTop = messagesElement.scrollHeight
    })
  })

  onCleanup(() => {
    cancelAnimationFrame(scrollFrame)
    cancelAnimationFrame(eventFrame)
    unsubscribeBackend()
    unsubscribeMenu()
    // Drain any debounced conversation writes before the window is torn down
    // so the user does not lose the most recent transcript.
    void conversationWriter.flush()
  })

  const conversationKey = (root = workspace()) => `chat.${encodeURIComponent(root)}`
  const sessionKey = (root = workspace()) => `chat.session.${encodeURIComponent(root)}`
  const threadsKey = (root = workspace()) => `chat.threads.${encodeURIComponent(root)}`
  const activeThreadKey = (root = workspace()) => `chat.active.${encodeURIComponent(root)}`
  const splitThreadKey = (root = workspace()) => `chat.split.${encodeURIComponent(root)}`
  const saveArtifactContext = async (patch: Partial<ArtifactContext>, root = workspace(), threadId = activeThreadId()) => {
    if (!root || !threadId) return
    const key = artifactContextKey(root, threadId)
    const current = (await window.api.store.get<ArtifactContext>(key)) || { updatedAt: Date.now() }
    await window.api.store.set(key, { ...current, ...patch, updatedAt: Date.now() })
  }
  const restoreArtifactContext = async (root: string, threadId?: string) => {
    setOpenFile(""); setFileContent(""); setFileNotice("")
    if (!threadId) { setPreviewOpen(false); return }
    const context = await window.api.store.get<ArtifactContext>(artifactContextKey(root, threadId))
    if (!context) { setPreviewOpen(false); return }
    if (context.previewUrl) { setPreviewURL(context.previewUrl); setPreviewDraft(context.previewUrl); setPreviewEnabled(true) }
    if (context.selectedPath) {
      const available = await window.api.workspace.files(root)
      setFiles(available)
      if (available.some((file) => file.path === context.selectedPath)) {
        setOpenFile(context.selectedPath)
        try { setFileContent(await window.api.workspace.read(root, context.selectedPath)); setFileNotice("") } catch { setFileNotice("Could not reopen") }
      } else {
        await saveArtifactContext({ selectedPath: undefined }, root, threadId)
      }
    }
  }
  const threadTitle = (next: ChatMessage[]) => {
    const first = next.find((message) => message.role === "user")?.logs.map((log) => log.content).join(" ").replace(/\s+/g, " ").trim()
    return first ? first.slice(0, 72) : "New chat"
  }
  const persistThreads = async (root: string, next: ChatThread[], activeId: string) => {
    setChatThreads(next)
    setActiveThreadId(activeId)
    // Only re-write the thread that actually changed plus the active id.
    // Every other thread in `next` is byte-identical to what is already on
    // disk, so the IPC round-trip and atomic write would be pure overhead.
    const changed: ChatThread | undefined = next.find((thread) => thread.id === activeId)
    if (changed) await conversationWriter.save(changed as unknown as StoredChatThread)
    await window.api.store.set(activeThreadKey(root), activeId)
  }
  const persistQueue = async (queue: QueuedPrompt[], threadId = activeThreadId()) => {
    if (!threadId) return
    if (queue.length) await window.api.store.set(queueStoreKey(threadId), queue)
    else await window.api.store.delete(queueStoreKey(threadId))
  }
  const restoreQueue = async (threadId?: string) => {
    if (!threadId) { setQueuedPrompts([]); return }
    setQueuedPrompts(parsePromptQueue(await window.api.store.get(queueStoreKey(threadId))))
  }
  const replaceQueue = async (queue: QueuedPrompt[]) => {
    setQueuedPrompts(queue)
    await persistQueue(queue)
  }
  const loadConversation = async (root: string) => {
    let stored = await window.api.conversations.list(root) as ChatThread[]
    const settingsThreads = (await window.api.store.get<ChatThread[]>(threadsKey(root))) ?? []
    if (!stored.length && settingsThreads.length) {
      stored = settingsThreads.map((thread) => ({ ...thread, workspace: root }))
      for (const thread of stored) await window.api.conversations.save(thread)
      await window.api.store.delete(threadsKey(root))
    }
    const legacyMessages = (await window.api.store.get<ChatMessage[]>(conversationKey(root))) ?? []
    const legacySession = (await window.api.store.get<string>(sessionKey(root))) ?? ""
    if (!stored.length && (legacyMessages.length || legacySession)) {
      const now = legacyMessages.at(-1)?.createdAt || Date.now()
      stored = [{ id: crypto.randomUUID(), workspace: root, title: threadTitle(legacyMessages), createdAt: legacyMessages[0]?.createdAt || now, updatedAt: now, messages: legacyMessages, sessionId: legacySession, sessionStatus: legacySession ? "resumable" : "new" }]
    }
    const preferred = await window.api.store.get<string>(activeThreadKey(root))
    const selected = stored.find((thread) => thread.id === preferred) || stored[0]
    setChatThreads(stored)
    setActiveThreadId(selected?.id || "")
    setMessages(selected?.messages || legacyMessages)
    setSessionId(selected?.sessionId || legacySession)
    if (stored.length) await persistThreads(root, stored, selected?.id || stored[0].id)
    const savedSplitId = await window.api.store.get<string>(splitThreadKey(root))
    const savedSplit = savedSplitId ? stored.find((thread) => thread.id === savedSplitId && thread.id !== selected?.id) : undefined
    setSplitThread(savedSplit || null)
    setSplitOpen(Boolean(savedSplit))
    await restoreQueue(selected?.id)
    await restoreArtifactContext(root, selected?.id)
    setHistoryIndex(-1); setHistoryDraft("")
  }
  const saveConversation = async (next: ChatMessage[]) => {
    setMessages(next)
    const root = workspace()
    if (!root) return
    const now = Date.now()
    const id = activeThreadId() || crypto.randomUUID()
    const current = chatThreads().find((thread) => thread.id === id)
    const thread: ChatThread = { ...current, id, workspace: root, title: current?.title && current.title !== "New chat" ? current.title : threadTitle(next), createdAt: current?.createdAt || now, updatedAt: now, messages: next, sessionId: sessionId(), model: model() || current?.model, sessionStatus: sessionId() ? "resumable" : current?.sessionStatus || "new" }
    const updated = [thread, ...chatThreads().filter((entry) => entry.id !== id)].sort((a, b) => b.updatedAt - a.updatedAt)
    await persistThreads(root, updated, id)
    void refreshSessionIndex()
    await window.api.store.set(conversationKey(root), next)
  }
  const persistSessionId = async (nextSessionId: string) => {
    setSessionId(nextSessionId)
    const root = workspace()
    if (!root) return
    await window.api.store.set(sessionKey(root), nextSessionId)
    const id = activeThreadId()
    if (!id) return
    const updated = chatThreads().map((thread) => thread.id === id ? { ...thread, sessionId: nextSessionId, sessionStatus: "resumable" as const, updatedAt: Date.now() } : thread)
    await persistThreads(root, updated, id)
  }
  const newConversation = async () => {
    const root = workspace()
    const id = crypto.randomUUID()
    const now = Date.now()
    const next: ChatThread[] = [{ id, workspace: root, title: "New chat", createdAt: now, updatedAt: now, messages: [], sessionId: "", model: model() || undefined, sessionStatus: "new" }, ...chatThreads()]
    if (root) await persistThreads(root, next, id)
    else { setChatThreads(next); setActiveThreadId(id) }
    setMessages([])
    setSessionId("")
    if (root) { await window.api.store.set(conversationKey(root), []); await window.api.store.delete(sessionKey(root)) }
    setEvents([])
    await replaceQueue([])
    setHistoryOpen(false)
  }
  const openConversation = async (entry: ChatThread | StoredChatSummary) => {
    if (running()) return
    const thread = "messageCount" in entry ? await window.api.conversations.get(entry.id) : entry
    if (!thread) return
    if (thread.workspace && thread.workspace !== workspace()) {
      setWorkspace(thread.workspace)
      setSelectedProject(projects().find((project) => project.path === thread.workspace) || null)
      await window.api.store.set(STORE_KEYS.workspaceLast, thread.workspace)
      await refreshFiles(thread.workspace)
      await loadGoal(thread.workspace)
    }
    setMessages(thread.messages)
    setSessionId(thread.sessionId)
    await restoreQueue(thread.id)
    setEvents([]); setHistoryOpen(false)
    const root = thread.workspace || workspace()
    if (root) {
      const workspaceThreads = await window.api.conversations.list(root) as ChatThread[]
      setChatThreads(workspaceThreads)
      setActiveThreadId(thread.id)
      await window.api.store.set(activeThreadKey(root), thread.id)
      await window.api.store.set(conversationKey(root), thread.messages)
      if (thread.sessionId) await window.api.store.set(sessionKey(root), thread.sessionId); else await window.api.store.delete(sessionKey(root))
      await restoreArtifactContext(root, thread.id)
      await refreshSessionIndex()
    }
  }
  const _forkConversation = async (thread: ChatThread) => {
    const now = Date.now()
    const fork: ChatThread = { ...thread, id: crypto.randomUUID(), title: `${thread.title} (fork)`, createdAt: now, updatedAt: now, sessionId: "", sessionStatus: "new", pinned: false, archived: false }
    await window.api.conversations.save(fork)
    if (fork.workspace === workspace()) setChatThreads((current) => [fork, ...current])
    await openConversation(fork)
  }
  const openSplitConversation = async (thread: ChatThread) => {
    if (thread.id === activeThreadId()) return
    const full = await window.api.conversations.get(thread.id) as ChatThread | undefined
    if (!full) return
    setFilesOpen(false); setTerminalRailOpen(false); setInspectorOpen(false); setPreviewOpen(false)
    setSplitThread(full); setSplitOpen(true)
    await window.api.store.set(splitThreadKey(workspace()), full.id)
  }
  const closeSplitConversation = async () => {
    setSplitOpen(false); setSplitThread(null)
    await window.api.store.delete(splitThreadKey(workspace()))
  }
  const focusSplitConversation = async () => {
    const thread = splitThread()
    if (!thread || running()) return
    await openConversation(thread)
    await closeSplitConversation()
  }
  const openLatestSplitConversation = async () => {
    const candidate = chatThreads().find((thread) => thread.id !== activeThreadId() && thread.messages.length)
    if (candidate) await openSplitConversation(candidate)
    else setSlashNotice("Create or keep another conversation before opening a split pane.")
  }
  const refreshHistory = async () => setHistoryResults(await window.api.conversations.search(historySearch(), historyAllWorkspaces() ? undefined : workspace()) as ChatThread[])
  const refreshArtifacts = async () => setArtifacts(collectArtifacts(await window.api.conversations.list()))
  const openArtifactThread = async (id: string) => {
    const thread = await window.api.conversations.get(id) as ChatThread | undefined
    if (!thread) return
    setActive("new-task")
    await openConversation(thread)
  }
  const updateThreadMeta = async (thread: ChatThread, patch: Partial<ChatThread>) => {
    const updated = { ...thread, ...patch, updatedAt: Date.now() }
    await window.api.conversations.save(updated)
    setChatThreads((current) => current.map((entry) => entry.id === updated.id ? updated : entry))
    void refreshSessionIndex()
    await refreshHistory()
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
  const signedFamilies = () => oauthStatus().providers.filter((row) => row.signedIn).map((row) => row.id)
  const modelOptions = () => catalogModelOptions(selectableModels(), providerSecrets(), catalog().defaultModel, signedFamilies())
  const paletteItems = () => filterPaletteItems(buildPaletteItems({
    commands: DESKTOP_SLASH_COMMANDS,
    views: NAV.map((item) => ({ id: item.id, label: item.label })),
    chats: chatThreads().filter((thread) => !thread.archived).map((thread) => ({ id: thread.id, title: thread.title })),
    models: selectableModels(),
  }), paletteQuery())
  const refreshSessionIndex = async () => setSessionIndex(await window.api.conversations.summaries(undefined))
  const switcherThreads = () => sessionIndex().filter((thread) => !thread.archived && thread.messageCount > 0)
    .sort((left, right) => Number(Boolean(right.pinned)) - Number(Boolean(left.pinned)) || right.updatedAt - left.updatedAt)
  const sessionWorkspaceLabel = (root: string) => projects().find((project) => project.path === root)?.name || root.split(/[\\/]+/).filter(Boolean).at(-1) || "Workspace"
  const sessionStatus = (thread: StoredChatSummary) => {
    if (thread.id === activeThreadId() && running()) return { kind: "running", label: "Running" }
    const latest = runs().find((run) => run.threadId === thread.id)
    if (latest?.status === "running") return { kind: "running", label: "Running" }
    if (latest?.status === "failed" || thread.sessionStatus === "broken") return { kind: "failed", label: "Needs attention" }
    if (latest?.status === "cancelled") return { kind: "cancelled", label: "Cancelled" }
    if (latest?.status === "completed" || thread.sessionStatus === "recovered" || thread.sessionStatus === "resumable") return { kind: "completed", label: "Ready" }
    return { kind: "idle", label: "New" }
  }
  createEffect(() => {
    const count = switcherThreads().length
    if (!count) { setSessionSwitcherIndex(0); setSessionSwitcherOpen(false) }
    else if (sessionSwitcherIndex() >= count) setSessionSwitcherIndex(count - 1)
  })
  createEffect(() => {
    if (!running()) return
    const refresh = () => void window.api.grokRuns.list().then(setRuns)
    refresh()
    const timer = setInterval(refresh, 1_500)
    onCleanup(() => clearInterval(timer))
  })
  const advanceSessionSwitcher = (direction: 1 | -1) => {
    const threads = switcherThreads()
    if (threads.length < 2) return
    setSessionSwitcherNotice("")
    const current = threads.findIndex((thread) => thread.id === activeThreadId())
    if (!sessionSwitcherOpen()) {
      setSessionSwitcherIndex((current + direction + threads.length) % threads.length)
      setSessionSwitcherOpen(true)
      return
    }
    setSessionSwitcherIndex((index) => (index + direction + threads.length) % threads.length)
  }
  const commitSessionSwitcher = async () => {
    if (running()) { setSessionSwitcherNotice("Stop the active task before switching conversations."); return }
    const target = switcherThreads()[sessionSwitcherIndex()]
    setSessionSwitcherOpen(false)
    setSessionSwitcherNotice("")
    if (target) await openConversation(target)
  }
  const runPaletteItem = async (id: string) => {
    setPaletteOpen(false); setPaletteQuery(""); setPaletteSelection(0)
    if (id.startsWith("command:")) { setActive("new-task"); setPrompt(`/${id.slice(8)} `); return }
    if (id.startsWith("view:")) { await navigate(id.slice(5)); return }
    if (id.startsWith("chat:")) {
      const thread = chatThreads().find((entry) => entry.id === id.slice(5))
      if (thread) await openConversation(thread)
      return
    }
    if (id.startsWith("model:")) await selectModelValue(id.slice(6))
  }
  const refreshModelCatalog = async () => setCatalog(await window.api.backend.models())
  const refreshOauth = async () => {
    try { setOauthStatus(await window.api.backend.oauthStatus()) }
    catch (error) { setOauthNotice(error instanceof Error ? error.message : String(error)) }
  }
  const signInProvider = async (provider: "xai" | "openai" | "minimax") => {
    setOauthBusy(provider)
    try {
      const result = await window.api.backend.oauthLogin(provider)
      setOauthNotice(result.message)
      await refreshOauth()
      for (let attempt = 0; attempt < 24; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 5_000))
        const snapshot = await window.api.backend.oauthStatus()
        setOauthStatus(snapshot)
        const row = snapshot.providers.find((entry) => entry.id === provider)
        if (row?.signedIn) {
          const next = await window.api.backend.models()
          setCatalog(next)
          const extra = provider === "openai"
            ? ` · ${next.models.filter((entry) => entry.startsWith("codex-")).length} Codex models`
            : ""
          setOauthNotice(`${row.label} connected${row.account ? ` · ${row.account}` : ""}${extra}`)
          return
        }
      }
      setOauthNotice("Sign-in is still waiting. Finish it in Terminal, then tap Refresh sign-in.")
    } catch (error) { setOauthNotice(error instanceof Error ? error.message : String(error)) }
    finally { setOauthBusy("") }
  }
  createEffect(() => {
    const available = props.backendStatus().available
    if (available && !backendWasAvailable) void refreshModelCatalog()
    backendWasAvailable = available
  })
  const modelPickerValue = () => moaEnabled() ? `__moa__:${moaCandidates()}` : model()
  const selectModelValue = async (value: string) => {
    if (value.startsWith("__moa__:")) {
      const count = Math.min(8, Math.max(2, Number(value.split(":")[1]) || 3))
      setMoaEnabled(true); setMoaCandidates(count)
      setMoaReferenceModels((current) => Array.from({ length: count }, (_, index) => current[index] || model() || catalog().defaultModel || catalog().models[0] || ""))
      await window.api.store.set(STORE_KEYS.moaEnabled, true); await window.api.store.set(STORE_KEYS.moaCandidates, count)
    } else {
      setMoaEnabled(false); setModel(value)
      await window.api.store.set(STORE_KEYS.moaEnabled, false); await window.api.store.set(STORE_KEYS.defaultsModel, value)
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
    else if (command.name === "new") { await newConversation(); setSlashNotice("Started a new chat") }
    else if (command.name === "model") {
      const found = selectableModels().find((entry) => entry === parsed.args)
      const moaMatch = parsed.args.match(/^moa(?::(\d+))?$/i)
      if (!parsed.args) setSlashNotice(`Current model: ${moaEnabled() ? `MoA ×${moaCandidates()} (${model() || "Grok Build default"})` : model() || "Grok Build default"}`)
      else if (moaMatch) { const count = Math.min(8, Math.max(2, Number(moaMatch[1]) || 3)); await selectModelValue(`__moa__:${count}`); setSlashNotice(`Model set to Mixture of Agents ×${count}`) }
      else if (found) { await selectModelValue(found); setSlashNotice(`Model set to ${found}`) }
      else setSlashNotice(`Unknown model: ${parsed.args}`)
    } else if (command.name === "think") { const next = setToggle(parsed.args, thinking()); setThinking(next); setSlashNotice(`Reasoning ${next ? "enabled" : "disabled"}`) }
    else if (command.name === "approve") { const next = setToggle(parsed.args, autoApprove()); setAutoApprove(next); setSlashNotice(`Automatic approval ${next ? "enabled" : "disabled"}`) }
    else if (command.name === "restart") { setSlashNotice("Restarting Grok Build Desktop…"); await window.api.app.restart() }
    else if (command.name === "moa") {
      if (parsed.args === "off") { setMoaEnabled(false); await window.api.store.set(STORE_KEYS.moaEnabled, false); setSlashNotice("Mixture of Agents disabled") }
      else {
        const requested = Number(parsed.args || moaCandidates())
        const count = Number.isFinite(requested) ? Math.min(8, Math.max(2, Math.floor(requested))) : moaCandidates()
        setMoaCandidates(count); setMoaEnabled(true)
        await window.api.store.set(STORE_KEYS.moaCandidates, count); await window.api.store.set(STORE_KEYS.moaEnabled, true)
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
      await window.api.store.set(STORE_KEYS.previewEnabled, true); setSlashNotice(`Preview ${next ? "opened" : "closed"}`)
    } else if (command.name === "stop") { await window.api.backend.cancel(); setSlashNotice("Stop requested") }
    else if (command.name === "retry") {
      const instruction = lastUserInstruction(messages())
      if (!instruction) setSlashNotice("No previous user instruction to retry")
      else { setSlashNotice("Retrying the previous instruction…"); queueMicrotask(() => void run(instruction)) }
    } else if (command.name === "undo") {
      const rewound = rewindLastTurn(messages())
      if (!rewound.removed.length) setSlashNotice("Nothing to undo")
      else {
        await saveConversation(rewound.remaining as ChatMessage[])
        setSessionId("")
        if (workspace()) await window.api.store.delete(sessionKey())
        const thread = chatThreads().find((entry) => entry.id === activeThreadId())
        if (thread) await updateThreadMeta(thread, { sessionId: "", sessionStatus: "new" })
        setSlashNotice("Removed the last turn. The next run starts a fresh Grok session from the visible transcript.")
      }
    } else if (command.name === "export") {
      if (!activeThreadId()) setSlashNotice("No conversation to export")
      else {
        const result = await window.api.conversations.export(activeThreadId())
        setSlashNotice(result.saved && result.path ? `Saved conversation to ${result.path}` : "Export cancelled")
      }
    } else if (command.name === "copy") {
      const lastAssistant = [...messages()].reverse().find((message) => message.role === "assistant")
      const text = lastAssistant?.logs.filter((log) => log.kind !== "thought").map((log) => log.content).join("\n").trim() || ""
      if (!text) setSlashNotice("No assistant reply to copy")
      else { await navigator.clipboard.writeText(text); setSlashNotice("Copied the last assistant reply") }
    } else if (command.name === "queue") {
      if (parsed.args === "clear") { await replaceQueue([]); setSlashNotice("Prompt queue cleared") }
      else setSlashNotice(describePromptQueue(queuedPrompts()))
    } else if (command.name === "compress") {
      const checkpoint = checkpointFor(messages())
      const thread = chatThreads().find((entry) => entry.id === activeThreadId())
      if (!checkpoint || !thread) setSlashNotice("Not enough visible conversation to compress yet")
      else { await updateThreadMeta(thread, { summary: checkpoint }); setSlashNotice("Stored a visible-only conversation checkpoint") }
    } else if (command.name === "workflow") {
      const [name, ...rest] = parsed.args.split(/\s+/)
      const workflow = parseWorkflowName(name || "")
      if (!workflow) setSlashNotice(`Workflows: ${Object.keys(WORKFLOWS).join(", ")}`)
      else {
        const goal = rest.join(" ").trim()
        setSlashNotice(`Starting Duck-Agent ${workflow} workflow through Grok Build…`)
        queueMicrotask(() => void run(frameWorkflowPrompt(workflow, goal)))
      }
    } else if (command.name === "doctor") {
      const status = props.backendStatus()
      const report = summarizeHarnessDoctor({ available: status.available, command: status.command, version: status.version, error: status.error })
      setSlashNotice(report.lines.join("\n"))
    }
    else {
      const destinations: Record<string, string> = { workspace: "workspace", terminal: "terminal", review: "review", skills: "skills", runs: "runs", scheduled: "scheduled", settings: "settings" }
      const destination = destinations[command.name]
      if (destination) await navigate(destination)
    }
    setPrompt(""); setSlashSelection(0)
    return true
  }

  onMount(async () => {
    const onAttachFile = (event: Event) => {
      const path = (event as CustomEvent<string>).detail
      const file = files().find((entry) => entry.path === path)
      if (file) setAttachedFiles((current) => toggleAttachedFile(current, file))
    }
    window.addEventListener("grok-attach-file", onAttachFile)
    onCleanup(() => window.removeEventListener("grok-attach-file", onAttachFile))
    onCleanup(window.api.telegram.onChange(() => { void refreshTelegram(false) }))
    onCleanup(window.api.schedules.onEvent((event) => {
      setSchedules((current) => current.map((task) => task.id === event.taskId ? { ...task, running: event.status === "running", lastError: event.status === "failed" ? event.detail : undefined, lastStatus: event.status === "completed" ? "completed" : event.status === "failed" ? "failed" : task.lastStatus } : task))
      if (event.status === "completed") announce("success", `Scheduled task finished · ${event.name}`, event.detail || "Grok Build completed the scheduled task.")
      if (event.status === "failed") announce("error", `Scheduled task failed · ${event.name}`, event.detail || "Review the scheduled task and try again.")
    }))
    const savedWorkspace = await window.api.store.get<string>(STORE_KEYS.workspaceLast)
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
      await window.api.store.set(STORE_KEYS.workspaceLast, current.path)
      await loadConversation(current.path)
      await loadGoal(current.path)
    }
    await refreshSessionIndex()
    await refreshTelegram()
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
    setCliPath((await window.api.store.get<string>(STORE_KEYS.cliPath)) || props.backendStatus().command || "grok")
    const friendly = resolveFriendlyDefaults({
      thinking: await window.api.store.get<boolean>(STORE_KEYS.defaultsThinking),
      autoApprove: await window.api.store.get<boolean>(STORE_KEYS.defaultsAutoApprove),
      selfVerify: await window.api.store.get<boolean>(STORE_KEYS.defaultsSelfVerify),
      webSearch: await window.api.store.get<boolean>(STORE_KEYS.defaultsWebSearch),
      subagents: await window.api.store.get<boolean>(STORE_KEYS.agentSubagents),
      autoUpdate: await window.api.store.get<boolean>(STORE_KEYS.autoUpdate),
      updateChannel: await window.api.store.get<"stable" | "alpha">(STORE_KEYS.updateChannel),
      maxTurns: await window.api.store.get<number>(STORE_KEYS.defaultsMaxTurns),
      autoLearn: await window.api.store.get<boolean>(STORE_KEYS.autoLearnEnabled),
      delegationMode: await window.api.store.get<"balanced" | "aggressive">(STORE_KEYS.agentDelegationMode),
    })
    setGrokAutoUpdate(friendly.values.autoUpdate)
    setGrokUpdateChannel(friendly.values.updateChannel)
    for (const [key, value] of Object.entries(friendly.persist)) {
      if (value === undefined) continue
      const storeKey = key === "thinking" ? STORE_KEYS.defaultsThinking
        : key === "autoApprove" ? STORE_KEYS.defaultsAutoApprove
        : key === "selfVerify" ? STORE_KEYS.defaultsSelfVerify
        : key === "webSearch" ? STORE_KEYS.defaultsWebSearch
        : key === "subagents" ? STORE_KEYS.agentSubagents
        : key === "autoUpdate" ? STORE_KEYS.autoUpdate
        : key === "updateChannel" ? STORE_KEYS.updateChannel
        : key === "maxTurns" ? STORE_KEYS.defaultsMaxTurns
        : key === "autoLearn" ? STORE_KEYS.autoLearnEnabled
        : key === "delegationMode" ? STORE_KEYS.agentDelegationMode
        : undefined
      if (storeKey) await window.api.store.set(storeKey, value)
    }
    void refreshOauth()
    const savedPreviewEnabled = (await window.api.store.get<boolean>(STORE_KEYS.previewEnabled)) ?? false
    const savedPreviewURL = (await window.api.store.get<string>(STORE_KEYS.previewUrl)) || "http://localhost:3000"
    // Remember that Preview is available, but never force the rail open on
    // launch. The user or agent opens it deliberately for the current task.
    setPreviewEnabled(savedPreviewEnabled); setPreviewOpen(false); setPreviewURL(savedPreviewURL); setPreviewDraft(savedPreviewURL)
    setSidebarCollapsed((await window.api.store.get<boolean>(STORE_KEYS.layoutSidebarCollapsed)) ?? false)
    setPreviewCollapsed((await window.api.store.get<boolean>(STORE_KEYS.layoutPreviewCollapsed)) ?? false)
    setMoaEnabled((await window.api.store.get<boolean>("moa.enabled")) ?? false)
    setMoaCandidates(Math.min(8, Math.max(2, (await window.api.store.get<number>(STORE_KEYS.moaCandidates)) || 3)))
    const savedReferences = (await window.api.store.get<string[]>(STORE_KEYS.moaReferenceModels)) ?? []
    setMoaReferenceModels(savedReferences.length ? savedReferences.slice(0, 8) : Array.from({ length: Math.min(8, Math.max(2, (await window.api.store.get<number>(STORE_KEYS.moaCandidates)) || 3)) }, () => catalog().defaultModel || catalog().models[0] || ""))
    setMoaAggregatorModel((await window.api.store.get<string>(STORE_KEYS.moaAggregatorModel)) || catalog().defaultModel || "")
    setMoaReferenceEffort((await window.api.store.get<"low" | "medium" | "high">(STORE_KEYS.moaReferenceEffort)) || "medium")
    setMoaAggregatorEffort((await window.api.store.get<"low" | "medium" | "high">(STORE_KEYS.moaAggregatorEffort)) || "high")
    setMoaReferenceTokenBudget(Math.min(2000, Math.max(200, (await window.api.store.get<number>(STORE_KEYS.moaReferenceTokenBudget)) || 600)))
    setThinking(friendly.values.thinking)
    setAutoApprove(friendly.values.autoApprove)
    setSelfVerify(friendly.values.selfVerify)
    setMaxTurns(Math.min(100, Math.max(0, friendly.values.maxTurns || 0)))
    setSessionIdleHours(Math.min(168, Math.max(0, (await window.api.store.get<number>(STORE_KEYS.agentSessionIdleHours)) || 0)))
    setMemoryStatus(await window.api.memory.status())
    setTelegramMemoryEnabled((await window.api.store.get<boolean>(STORE_KEYS.memoryTelegramEnabled)) ?? false)
    setAutoLearnEnabled(friendly.values.autoLearn)
    setAutoLearnInterval(Math.min(50, Math.max(1, (await window.api.store.get<number>(STORE_KEYS.autoLearnInterval)) || 10)))
    setAutoLearnModel((await window.api.store.get<string>(STORE_KEYS.autoLearnModel)) || "")
    setAutoLearnStatus((await window.api.store.get<string>(STORE_KEYS.autoLearnLastStatus)) || "No review has run yet")
    setWebSearchEnabled(friendly.values.webSearch)
    setAgentAppControls((await window.api.store.get<boolean>(STORE_KEYS.agentAppControls)) ?? false)
    setSubagentsEnabled(friendly.values.subagents)
    setDelegationMode(friendly.values.delegationMode)
    // Older builds enabled high reasoning, self-verification, and subagents at
    // the same time. That made an ordinary desktop prompt substantially slower
    // than the equivalent direct CLI command. Migrate once to CLI-like defaults;
    // each capability remains available as an explicit toggle for deep runs.
    if (!((await window.api.store.get<boolean>(STORE_KEYS.defaultsCliSpeedMigrated)) ?? false)) {
      setThinking(false)
      setSelfVerify(false)
      setSubagentsEnabled(false)
      await window.api.store.set(STORE_KEYS.defaultsThinking, false)
      await window.api.store.set(STORE_KEYS.defaultsSelfVerify, false)
      await window.api.store.set(STORE_KEYS.agentSubagents, false)
      await window.api.store.set(STORE_KEYS.defaultsCliSpeedMigrated, true)
    }
    const savedAdvanced = (await window.api.store.get<Partial<AdvancedSettings>>(STORE_KEYS.defaultsAdvanced)) || {}
    const executionDefaultsMigrated = (await window.api.store.get<boolean>(STORE_KEYS.defaultsExecutionV2)) ?? false
    const nextAdvanced = { ...ADVANCED_DEFAULTS, ...savedAdvanced }
    if (!executionDefaultsMigrated) {
      if (!savedAdvanced.permissionMode || savedAdvanced.permissionMode === "default" || savedAdvanced.permissionMode === "acceptEdits") nextAdvanced.permissionMode = "auto"
      if (savedAdvanced.noPlan === undefined || savedAdvanced.noPlan === false) nextAdvanced.noPlan = true
      await window.api.store.set(STORE_KEYS.defaultsAdvanced, nextAdvanced)
      await window.api.store.set(STORE_KEYS.defaultsExecutionV2, true)
    }
    setAdvanced(nextAdvanced)
    const savedModel = await window.api.store.get<string>("defaults.model")
    if (savedModel && selectableModels().includes(savedModel)) setModel(savedModel)
    unsubscribeBackend = window.api.backend.onEvent((event: BackendEvent) => {
      if (event.sessionId && workspace()) {
        void persistSessionId(event.sessionId)
      }
      if (event.type === "text" && event.data) queueBackendEvent({ kind: "text", content: event.data })
      if (event.type === "thought" && event.data) queueBackendEvent({ kind: "thought", content: event.data })
      if (event.type === "thought" && event.data?.includes("Recovered the conversation")) {
        const thread = chatThreads().find((entry) => entry.id === activeThreadId())
        if (thread) void updateThreadMeta(thread, { sessionStatus: "recovered" })
      }
      if (event.type === "error" && event.message) queueBackendEvent({ kind: "error", content: event.message })
      if (event.type === "cancelled") queueBackendEvent({ kind: "text", content: event.data || "Task cancelled." })
    })
    const unsubscribeQuickEntry = window.api.onQuickEntrySubmit((payload) => {
      if (payload.target === "new") void newConversation().then(() => void run(payload.text))
      else void run(payload.text)
    })
    const onGlobalKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setPaletteOpen((open) => !open)
        setPaletteQuery("")
        setPaletteSelection(0)
      } else if (event.ctrlKey && !event.metaKey && event.key === "Tab") {
        event.preventDefault()
        advanceSessionSwitcher(event.shiftKey ? -1 : 1)
      } else if (event.key === "Enter" && sessionSwitcherOpen()) {
        event.preventDefault()
        void commitSessionSwitcher()
      } else if (event.key === "Escape" && paletteOpen()) {
        event.preventDefault()
        setPaletteOpen(false)
      } else if (event.key === "Escape" && sessionSwitcherOpen()) {
        event.preventDefault()
        setSessionSwitcherOpen(false)
      }
    }
    window.addEventListener("keydown", onGlobalKey)
    onCleanup(() => { window.removeEventListener("keydown", onGlobalKey); unsubscribeQuickEntry() })
    unsubscribeMenu = window.api.onMenuCommand((command) => {
      if (command === "new-task") {
        setActive("new-task")
        void newConversation()
      } else if (command === "open-project") void chooseWorkspace()
      else if (command === "grok-status") {
        // Stale streamed output from a previously-running task must not surface
        // in the chat view just because the user invoked a menu shortcut.
        if (!running()) setEvents([])
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
      await window.api.store.set(STORE_KEYS.workspaceLast, project.path)
      await loadProject(project)
    }
  }

  const useScratchWorkspace = async () => {
    const scratch = await window.api.projects.scratch()
    setSelectedProject(scratch)
    setWorkspace(scratch.path)
    setProjects((current) => [scratch, ...current.filter((entry) => entry.id !== scratch.id)])
    await window.api.store.set(STORE_KEYS.workspaceLast, scratch.path)
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
    void window.api.backend.autoLearn({ prompt: buildAutoLearnPrompt(conversation, skills().length), cwd: workspace(), model: autoLearnModel() || model() || undefined })
      .then(async () => {
        const status = `Last review completed ${new Date().toLocaleString()}`
        setAutoLearnStatus(status); await window.api.store.set(STORE_KEYS.autoLearnLastStatus, status)
        setSkills(await window.api.skills.list(workspace()))
      })
      .catch(async (error) => {
        const status = `Last review failed: ${error instanceof Error ? error.message : String(error)}`
        setAutoLearnStatus(status); await window.api.store.set(STORE_KEYS.autoLearnLastStatus, status)
      })
  }

  const run = async (requested?: string, options?: { ephemeral?: boolean; modelOverride?: string }): Promise<TaskLog[]> => {
    const rawSubmitted = (requested ?? prompt()).trim()
    const ephemeral = options?.ephemeral === true
    if (!rawSubmitted) return []
    if (!ephemeral && await executeSlashCommand(rawSubmitted)) return []
    const submitted = formatAttachedPrompt(rawSubmitted, attachedFiles())
    setAttachedFiles([])
    if (running()) {
      if (ephemeral) return [{ kind: "error", content: "Grok is already running another task." }]
      await replaceQueue(enqueuePrompt(queuedPrompts(), submitted, crypto.randomUUID()))
      setPrompt(""); setHistoryIndex(-1)
      announce("info", "Task queued", "Grok Build will start this instruction when the active run finishes.")
      return []
    }
    setPrompt(""); setEvents([]); setRunning(true)
    if (!ephemeral) announce("info", "Task started", "Grok Build is working in the selected workspace.")
    let completedLogs: TaskLog[] = []
    try {
      let runWorkspace = workspace()
      if (!runWorkspace) {
        const scratch = await window.api.projects.scratch()
        setProjects((current) => current.some((project) => project.path === scratch.path) ? current : [scratch, ...current])
        setSelectedProject(scratch)
        setWorkspace(scratch.path)
        runWorkspace = scratch.path
        await window.api.store.set(STORE_KEYS.workspaceLast, scratch.path)
        await loadConversation(scratch.path)
        await loadGoal(scratch.path)
      }
      const priorMessages = messages()
      if (!ephemeral) await saveConversation([...priorMessages, { id: crypto.randomUUID(), role: "user", logs: [{ kind: "text", content: submitted }], createdAt: Date.now() }])
      const activeGoal = !ephemeral && goal()?.status === "active" ? goal() : null
      let executionPrompt = activeGoal
        ? `## Durable workspace goal\n${activeGoal.objective}\n\n## Current instruction\n${submitted}\n\nMake concrete progress toward the durable goal, verify your work, and report remaining work clearly.\nThis is iteration ${activeGoal.iterations + 1}. ${activeGoal.iterations > 0 ? "Previous iterations have already made progress; do not repeat completed work. Summarize what is left at the end of this turn." : "Start with the highest-leverage sub-task you can fully verify."}`
        : submitted
      const resumeSession = ephemeral ? "" : sessionId()
      const activeThread = chatThreads().find((thread) => thread.id === activeThreadId())
      const recentContext = ephemeral ? "" : visibleConversationContext(priorMessages, activeThread?.summary)
      const withRecentContext = (instruction: string) => `## Recent conversation context\nContinue this workspace conversation without repeating completed work. Preserve decisions, unfinished tasks, and the user's intent.\n\n${recentContext}\n\n## Current instruction\n${instruction}`
      if (!resumeSession && recentContext) executionPrompt = withRecentContext(executionPrompt)
      if (!ephemeral && agentAppControls()) {
        executionPrompt += `\n\n## Desktop host controls\nYou may control safe app features by ending your response with one or more exact action tags. Use only when useful:\n<app_action>{"type":"preview.open"}</app_action>\n<app_action>{"type":"browser.open","url":"https://example.com"}</app_action>\n<app_action>{"type":"desktop.status"}</app_action>\n<app_action>{"type":"schedule.create","name":"Task name","prompt":"Task prompt","runAt":1770000000000,"repeatMinutes":60}</app_action>\nThese actions are schema-validated by the host. Browser and desktop actions only count as successful when the host returns ok:true with observed state. Never place shell commands or secrets in an action.`
        if (previewOpen()) {
          try {
            const inspection = await window.api.preview.inspect()
            executionPrompt += `\n\n## Live rendered preview\nYou can inspect the current rendered page below and may use the screenshot with your image-reading tools. Re-check your source files before editing.\nURL: ${inspection.url}\nTitle: ${inspection.title}\nViewport: ${inspection.viewport.width}x${inspection.viewport.height}\nScreenshot: ${inspection.screenshotPath}\nInteractive controls: ${JSON.stringify(inspection.controls)}\nLinks: ${JSON.stringify(inspection.links)}\nRendered text:\n${inspection.text}\n\nRendered DOM snapshot:\n${inspection.html}`
          } catch (error) {
            executionPrompt += `\n\n## Live rendered preview\nPreview inspection is currently unavailable: ${error instanceof Error ? error.message : String(error)}`
          }
        }
      }
      if (!ephemeral && subagentsEnabled()) {
        executionPrompt += delegationMode() === "aggressive"
          ? `\n\n## Subagent delegation\nUse Grok Build subagents proactively for independent research, code inspection, testing, and rendered-preview review. Parallelize bounded non-overlapping work, keep one primary agent responsible for integration, and verify every delegated result before applying it. Do not delegate trivial work or let multiple agents edit the same files.`
          : `\n\n## Subagent delegation\nUse Grok Build subagents when two or more independent workstreams would materially improve speed or quality (for example code inspection plus tests, or implementation plus rendered-preview review). Keep one primary integrator, avoid overlapping edits, and verify delegated results.`
      }
      const references = moaReferenceModels().slice(0, moaCandidates()).filter(Boolean)
      // Prefer Grok Build's own --best-of-n when candidates use one model.
      // The desktop-only advisor fan-out remains for the mixed-model case the
      // CLI cannot represent with a single native command.
      const mixedModelMoA = references.length >= 2 && new Set(references).size > 1
      const advancedRun = advanced()
      const selectedRunModel = options?.modelOverride?.trim() || model() || undefined
      // Prefer the catalog default for browser failover. MiniMax M3 currently
      // emits malformed streaming events, while M2.7 often spends its only
      // constrained turn trying to invoke coding tools instead of returning
      // the required browser directive.
      const browserFallbackModel = [catalog().defaultModel || "", "nemotron-3-ultra-550b", "grok-4.5", ...catalog().models]
        .find((candidate) => candidate && candidate !== selectedRunModel)
      const result = await window.api.backend.run(ephemeral
        ? {
            prompt: executionPrompt,
            cwd: runWorkspace,
            model: selectedRunModel,
            fallbackModel: browserFallbackModel || undefined,
            thinking: thinking(),
            autoApprove: false,
            maxTurns: 1,
            disableWebSearch: true,
            subagents: false,
            permissionMode: "plan",
            memory: "disabled",
            systemPrompt: BROWSER_AGENT_SYSTEM_PROMPT,
            verbatim: true,
            jsonSchema: BROWSER_AGENT_DIRECTIVE_SCHEMA,
            noPlan: false,
            longTermMemory: false,
            hostControls: false,
          }
        : { prompt: executionPrompt, cwd: runWorkspace, threadId: activeThreadId() || undefined, model: model() || undefined, thinking: thinking(), autoApprove: autoApprove(), resume: resumeSession || undefined, resumeFallbackPrompt: resumeSession && recentContext ? withRecentContext(executionPrompt) : undefined, bestOfN: moaEnabled() && !mixedModelMoA ? moaCandidates() : undefined, moa: moaEnabled() && mixedModelMoA ? { referenceModels: references, aggregatorModel: moaAggregatorModel() || model() || undefined, referenceReasoningEffort: moaReferenceEffort(), aggregatorReasoningEffort: moaAggregatorEffort(), referenceTokenBudget: moaReferenceTokenBudget(), context: recentContext || undefined } : undefined, selfVerify: selfVerify() || Boolean(activeGoal), maxTurns: maxTurns() || undefined, disableWebSearch: !webSearchEnabled(), subagents: subagentsEnabled(), agent: advancedRun.agent || undefined, agents: advancedRun.agents || undefined, permissionMode: advancedRun.permissionMode, allow: advancedRun.allow.split(/[,\n]/).map((item) => item.trim()).filter(Boolean), deny: advancedRun.deny.split(/[,\n]/).map((item) => item.trim()).filter(Boolean), tools: advancedRun.tools || undefined, disallowedTools: advancedRun.disallowedTools || undefined, memory: advancedRun.memory, sandbox: advancedRun.sandbox || undefined, rules: advancedRun.rules || undefined, systemPrompt: advancedRun.systemPrompt || undefined, verbatim: advancedRun.verbatim, forkSession: advancedRun.forkSession, restoreCode: advancedRun.restoreCode, worktree: advancedRun.worktree, worktreeName: advancedRun.worktreeName || undefined, worktreeRef: advancedRun.worktreeRef || undefined, jsonSchema: advancedRun.jsonSchema || undefined, promptFile: advancedRun.promptFile || undefined, promptJson: advancedRun.promptJson || undefined, sessionId: advancedRun.sessionId || undefined, noPlan: advancedRun.noPlan })
      if (!ephemeral && result.grokSessionId) await persistSessionId(result.grokSessionId)
      if (activeGoal) await saveGoal({ ...activeGoal, iterations: activeGoal.iterations + 1, updatedAt: Date.now() })
    } catch (error) {
      const message = (error as Error).message
      queueBackendEvent({ kind: "error", content: message })
      if (sessionId()) {
        const thread = chatThreads().find((entry) => entry.id === activeThreadId())
        if (thread) await updateThreadMeta(thread, { sessionStatus: "broken" })
        // A timed-out/failed native session is frequently the reason Retry is
        // slow again. Drop the poisoned backend session so the next turn starts
        // fresh; the visible transcript is already preserved and will seed the
        // run via the recent-context block.
        const message = error instanceof Error ? error.message : String(error)
        const poisoned = /no output for \d+ minutes|timed? ?out|session.{0,40}(?:failed|invalid|missing|not found|expired)|serialization|connection|exited from an unknown signal|exited 1\b/i.test(message)
        if (poisoned) {
          setSessionId("")
          if (workspace()) await window.api.store.delete(sessionKey())
          if (thread) await updateThreadMeta(thread, { sessionId: "" })
        }
      }
    } finally {
      flushBackendEvents()
      setRunning(false)
      // Browser planning uses a JSON envelope that can itself contain
      // provider reasoning tags inside a quoted `text` field. Running that
      // envelope through the coding chat's reasoning splitter corrupts the
      // JSON and triggers the generic "applied changes" fallback. Preserve
      // browser payloads byte-for-byte and keep provider thoughts separate.
      const completed = ephemeral
        ? events().filter((entry) => entry.kind === "text" || entry.kind === "error")
        : ensurePublicCompletion(events())
      completedLogs = completed
      if (!ephemeral && completed.length) {
        const failed = completed.some((entry) => entry.kind === "error")
        announce(failed ? "error" : "success", failed ? "Task needs attention" : "Task finished", failed ? "Review the latest error in the transcript." : "Grok Build completed the current instruction.")
      }
      if (!ephemeral && agentAppControls()) {
        const text = completed.map((entry) => entry.content).join("\n")
        // Centralised validator enforces the same schema the Telegram agent
        // dispatcher uses, so a hostile action tag can never slip past one
        // surface but get caught by another. Each non-`ok` result is recorded
        // instead of silently dropped.
        const { actions, errors } = validateAppActions(text)
        const actionNotices: string[] = []
        for (const failed of errors) actionNotices.push(`Action rejected: ${failed}`)
        for (const action of actions) {
          try {
            if (action.type === "preview.open" && workspace()) {
              const result = await window.api.preview.start(workspace())
              setPreviewEnabled(true); setPreviewOpen(true); setPreviewURL(result.url); setPreviewDraft(result.url); setPreviewStatus("Built-in preview")
              actionNotices.push(`Preview opened at ${result.url}`)
            } else if (action.type === "browser.open") {
              const result = await window.api.hostControls.browserOpen(action.url)
              actionNotices.push(result.ok ? `Browser verified by ${result.backend}` : result.permission_required ? `Browser permission required: ${result.error}` : `Browser action failed: ${result.error}`)
            } else if (action.type === "desktop.status") {
              const result = await window.api.hostControls.desktopStatus()
              actionNotices.push(result.ok ? `Computer use ready via ${result.backend}` : result.permission_required ? `Computer-use permission required: ${result.error}` : `Computer use unavailable: ${result.error}`)
            } else if (action.type === "schedule.create") {
              await window.api.schedules.add({ name: action.name, prompt: action.prompt, cwd: workspace(), model: model() || undefined, runAt: action.runAt, repeatMinutes: action.repeatMinutes })
              actionNotices.push(`Scheduled "${action.name.slice(0, 60)}" for ${new Date(action.runAt).toLocaleString()}`)
            }
          } catch (error) {
            actionNotices.push(`Action failed: ${error instanceof Error ? error.message : String(error)}`)
          }
        }
        if (actionNotices.length) setSlashNotice(actionNotices.join("\n"))
      }
      if (!ephemeral && completed.length) {
        const nextMessages = [...messages(), { id: crypto.randomUUID(), role: "assistant" as const, logs: completed, createdAt: Date.now() }]
        await saveConversation(nextMessages)
        const checkpoint = checkpointFor(nextMessages)
        const thread = chatThreads().find((entry) => entry.id === activeThreadId())
        if (checkpoint && thread && nextMessages.length % 10 < 2) await updateThreadMeta(thread, { summary: checkpoint })
      }
      setEvents([])
    }
    setRuns(await window.api.grokRuns.list())
    setSkills(await window.api.skills.list(workspace()))
    if (!ephemeral && !submitted.startsWith("[/learn]")) await maybeAutoLearn()
    const drained = ephemeral ? undefined : dequeuePrompt(queuedPrompts())
    const queued = drained?.next
    if (queued) {
      await replaceQueue(drained.remaining)
      queueMicrotask(() => void run(queued.text))
    }
    return completedLogs
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

  const refreshTelegram = async (probe = false) => {
    const status = await window.api.telegram.status(probe)
    setTelegram(status)
    setTelegramInbox(await window.api.telegram.chats())
    setTelegramPendingChats(await window.api.telegram.pendingChats())
    setTelegramAllowedChats((await window.api.telegram.allowedChats()).join(", "))
    return status
  }
  const connectTelegram = async () => {
    setTelegramNotice("")
    try {
      const status = await window.api.telegram.connect(token())
      setTelegram(status)
      setToken("")
      await refreshTelegram()
      setTelegramNotice(status.connected ? `Connected as @${status.username ?? "bot"}` : status.error ?? "Could not connect")
    } catch (error) { setTelegramNotice(error instanceof Error ? error.message : String(error)) }
  }
  createEffect(() => {
    if (active() !== "telegram") return
    const timer = window.setInterval(() => { void refreshTelegram(false) }, 8000)
    onCleanup(() => clearInterval(timer))
  })

  const refreshLocalStudio = async () => setLocalStudio(await window.api.localStudio.status())
  const updateAdvanced = async <K extends keyof AdvancedSettings>(key: K, value: AdvancedSettings[K]) => {
    const next = { ...advanced(), [key]: value }
    setAdvanced(next)
    await window.api.store.set(STORE_KEYS.defaultsAdvanced, next)
  }
  const runBackendTool = async (command = backendToolCommand()) => {
    if (!command.trim() || backendToolRunning()) return
    setBackendToolCommand(command); setBackendToolRunning(true); setBackendToolOutput(`$ grok ${command}\n`)
    try {
      const result = await window.api.backend.tool(command, workspace() || undefined)
      setBackendToolOutput(`$ grok ${command}\n${result.stdout}${result.stderr}`)
      setCatalog(await window.api.backend.models())
    } catch (error) { setBackendToolOutput(`$ grok ${command}\n${error instanceof Error ? error.message : String(error)}`) }
    finally { setBackendToolRunning(false) }
  }
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
  const selectFile = async (path: string) => { setOpenFile(path); setFileContent(await window.api.workspace.read(workspace(), path)); setFileNotice(""); await saveArtifactContext({ selectedPath: path }) }
  const applyContextRail = (next: ContextRailMode | null) => {
    setContextRailMode(next)
    setFilesOpen(next === "files")
    setPreviewOpen(next === "preview")
    setInspectorOpen(next === "activity")
    setTerminalRailOpen(next === "terminal")
  }
  const toggleFilesRail = async () => {
    const next = nextSessionRail(contextRailMode(), "files") as ContextRailMode | null
    applyContextRail(next)
    if (next === "files") {
      await refreshFiles()
    }
  }
  const toggleTerminalRail = () => {
    const next = nextSessionRail(contextRailMode(), "terminal") as ContextRailMode | null
    applyContextRail(next)
  }
  const toggleActivityRail = () => {
    const next = nextSessionRail(contextRailMode(), "activity") as ContextRailMode | null
    applyContextRail(next)
  }
  const togglePreviewRail = async () => {
    const next = nextSessionRail(contextRailMode(), "preview", previewEnabled()) as ContextRailMode | null
    applyContextRail(next)
    if (next === "preview" && workspace() && !previewURL()) {
      try { const result = await window.api.preview.start(workspace()); setPreviewURL(result.url); setPreviewDraft(result.url); setPreviewStatus("Built-in preview") } catch (error) { setPreviewStatus(error instanceof Error ? error.message : String(error)) }
    }
  }
  const previewFile = async (path: string) => {
    try {
      if (!workspace()) return
      const result = await window.api.preview.start(workspace())
      const target = `${result.url}/${path.split(/[\\/]+/).filter(Boolean).map(encodeURIComponent).join("/")}`
      setPreviewDraft(target); setPreviewURL(target); setPreviewEnabled(true); applyContextRail("preview"); setPreviewStatus("File preview"); await saveArtifactContext({ selectedPath: path, previewUrl: target })
    } catch (error) {
      announce("error", "Preview unavailable", error instanceof Error ? error.message : String(error))
    }
  }
  const saveFile = async () => { if (!openFile()) return; await window.api.workspace.write(workspace(), openFile(), fileContent()); setFileNotice("Saved") }
  const runCommand = async (commandOverride?: string) => {
    const command = (commandOverride ?? terminalCommand()).trim()
    if (!workspace() || !command || terminalRunning()) return
    if (command !== terminalCommand()) setTerminalCommand(command)
    setTerminalRunning(true); setTerminalOutput((old) => `${old}${old ? "\n" : ""}$ ${command}\n`)
    try {
      const result = await window.api.workspace.command(workspace(), command); const output = result.stdout + result.stderr
      setTerminalOutput((old) => {
        const next = `${old}${output}\n[exit ${result.code}]\n`
        // Keep the most recent 200k chars so a long-running dev session does
        // not let the terminal signal grow unbounded and stall the renderer.
        return next.length > 200_000 ? `…[output truncated]\n${next.slice(-200_000)}` : next
      })
      const detected = output.match(/https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?(?:\/[^\s]*)?/i)?.[0]
      if (detected && previewEnabled()) {
        const url = detected.replace("0.0.0.0", "127.0.0.1")
        setPreviewURL(url); setPreviewDraft(url); setPreviewOpen(true); setPreviewStatus("Detected dev server")
        await window.api.store.set(STORE_KEYS.previewUrl, url)
        await saveArtifactContext({ previewUrl: url })
      }
    } catch (error) {
      setTerminalOutput((old) => `${old}${error instanceof Error ? error.message : String(error)}\n[command failed]\n`)
    } finally { setTerminalRunning(false) }
  }
  const refreshDiff = async (root = workspace()) => { if (root) { setGitChanges(await window.api.workspace.gitChanges(root)); setSelectedDiff(""); setDiffContent("") } }
  const applyReviewAction = async (path: string, action: "stage" | "unstage" | "discard") => {
    if (!workspace()) return
    try {
      await window.api.workspace.gitAction(workspace(), path, action)
      await refreshDiff()
      setSlashNotice(`${action === "discard" ? "Discarded" : action === "stage" ? "Staged" : "Unstaged"} ${path}`)
    } catch (error) {
      setSlashNotice(`Git action failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  const useSkillInChat = (name: string) => { setPrompt(`/${name} `); setSlashNotice(""); void navigate("new-task") }
  const askReviewInChat = () => {
    const paths = gitChanges().slice(0, 24).map((change) => `${change.status} ${change.path}`).join("\n")
    setPrompt(paths ? `Review the current Git changes and propose the highest-impact next steps.\n\n${paths}` : "Review this codebase and suggest the highest-impact improvements.")
    void navigate("new-task")
  }

  const loadProject = async (project: ProjectSnapshot) => {
    setOpenFile(""); setFileContent(""); setFileNotice(""); setSelectedDiff(""); setDiffContent("")
    // Switching workspaces must never leak in-flight event buffers, queued
    // prompts, or a half-finished typing indicator from the previous one.
    if (project.path !== workspace()) { setEvents([]); await replaceQueue([]) }
    if (active() === "workspace") await refreshFiles(project.path)
    if (active() === "review") await refreshDiff(project.path)
    if (active() === "skills") setSkills(await window.api.skills.list(project.path))
    await loadConversation(project.path)
    await loadGoal(project.path)
  }

  const selectProject = async (project: ProjectSnapshot) => {
    setSelectedProject(project); setWorkspace(project.path)
    await window.api.store.set(STORE_KEYS.workspaceLast, project.path)
    await loadProject(project)
  }

  const navigate = async (view: string) => {
    setActive(view)
    if (view === "workspace") await refreshFiles()
    if (view === "review") await refreshDiff()
    if (view === "skills") setSkills(await window.api.skills.list(workspace() || undefined))
    if (view === "runs") setRuns(await window.api.grokRuns.list())
    if (view === "artifacts") await refreshArtifacts()
    if (view === "scheduled") setSchedules(await window.api.schedules.list())
    if (view === "browser-agent") setCatalog(await window.api.backend.models())
    if (view === "telegram") {
      setCatalog(await window.api.backend.models())
      setRuns(await window.api.grokRuns.list())
      setSchedules(await window.api.schedules.list())
      setAgentTab("telegram")
      await refreshTelegram(false)
    }
    if (view === "settings") {
      setCatalog(await window.api.backend.models())
      const providers = await window.api.providerSecrets.list()
      setProviderSecrets(providers)
      setEndpointDrafts(Object.fromEntries(providers.map((provider) => [provider.id, provider.baseUrl])))
      setModelDrafts(Object.fromEntries(providers.map((provider) => [provider.id, provider.modelId])))
      await refreshOauth()
    }
  }

  return <div class={`app-root ${sidebarCollapsed() ? "app-root--sidebar-collapsed" : ""}`}>
    <NotificationStack notifications={notifications()} onDismiss={(id) => setNotifications((current) => current.filter((notice) => notice.id !== id))} />
    <Show when={paletteOpen()}>
      <div class="command-palette" role="dialog" aria-label="Command palette">
        <input
          autofocus
          value={paletteQuery()}
          placeholder="Search commands, chats, models…"
          onInput={(event) => { setPaletteQuery(event.currentTarget.value); setPaletteSelection(0) }}
          onKeyDown={(event) => {
            const items = paletteItems()
            if (event.key === "ArrowDown") { event.preventDefault(); setPaletteSelection((value) => items.length ? (value + 1) % items.length : 0) }
            else if (event.key === "ArrowUp") { event.preventDefault(); setPaletteSelection((value) => items.length ? (value - 1 + items.length) % items.length : 0) }
            else if (event.key === "Enter") { event.preventDefault(); const item = items[paletteSelection()]; if (item) void runPaletteItem(item.id) }
            else if (event.key === "Escape") { event.preventDefault(); setPaletteOpen(false) }
          }}
        />
        <For each={paletteItems()} fallback={<p>No matches.</p>}>
          {(item, index) => <button class={index() === paletteSelection() ? "active" : ""} onMouseDown={(event) => { event.preventDefault(); void runPaletteItem(item.id) }}><strong>{item.label}</strong><span>{item.hint}</span></button>}
        </For>
      </div>
    </Show>
    <Show when={sessionSwitcherOpen()}>
      <div class="session-switcher" role="dialog" aria-label="Conversation switcher">
        <header><strong>Switch conversation</strong><span>Ctrl+Tab to move · Enter to open · Esc to close</span></header>
        <Show when={sessionSwitcherNotice()}><p class="session-switcher__notice">{sessionSwitcherNotice()}</p></Show>
        <div class="session-switcher__list">
          <For each={switcherThreads()}>
            {(thread, index) => <button class={index() === sessionSwitcherIndex() ? "active" : ""} onMouseDown={(event) => { event.preventDefault(); setSessionSwitcherIndex(index()); void commitSessionSwitcher() }}>
              <span class="session-switcher__icon">{thread.id === activeThreadId() ? "●" : "○"}</span>
              <span class="session-switcher__copy"><strong>{thread.title}</strong><small>{sessionWorkspaceLabel(thread.workspace)} · {thread.messageCount} messages · {new Date(thread.updatedAt).toLocaleString()}</small></span>
              <span class={`session-switcher__status session-switcher__status--${sessionStatus(thread).kind}`}><i />{sessionStatus(thread).label}</span>
              <kbd>{index() + 1}</kbd>
            </button>}
          </For>
        </div>
      </div>
    </Show>
    <aside class={`sidebar ${sidebarCollapsed() ? "sidebar--collapsed" : ""}`}>
      <div class="brand"><img class="brand__logo" src={grokBuildLogo} alt="" /><span>Grok Build</span><button class="sidebar-collapse" onClick={async () => { const next = !sidebarCollapsed(); setSidebarCollapsed(next); await window.api.store.set(STORE_KEYS.layoutSidebarCollapsed, next) }} title={sidebarCollapsed() ? "Expand sidebar" : "Collapse sidebar"}>{sidebarCollapsed() ? "›" : "‹"}</button></div>
      <nav class="sidebar__nav"><For each={NAV}>{(item) => <button class={`sidebar__item ${active() === item.id ? "sidebar__item--active" : ""}`} onClick={() => void navigate(item.id)}><span>{item.icon}</span>{item.label}<Show when={item.id === "telegram" && telegramInbox().pending.length}><span class="project-changes">{telegramInbox().pending.length}</span></Show></button>}</For></nav>
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

    <main class={`main-content ${active() === "new-task" ? "main-content--chat" : ""} ${active() === "browser-agent" ? "main-content--browser-agent" : ""} ${["workspace", "terminal", "review"].includes(active()) ? "main-content--ide" : ""} ${["artifacts", "skills", "scheduled", "runtime", "runs", "settings", "telegram"].includes(active()) ? "main-content--page" : ""} ${active() === "new-task" && previewEnabled() && previewOpen() ? "main-content--preview" : ""}`}>
      <Show when={active() === "artifacts"} fallback={<Show when={active() === "review"} fallback={
      <Show when={active() === "workspace"} fallback={
      <Show when={active() === "terminal"} fallback={
      <Show when={active() === "skills"} fallback={
      <Show when={active() === "scheduled"} fallback={
      <Show when={active() === "settings"} fallback={
      <Show when={active() === "telegram"} fallback={
        <Show when={active() === "runtime"} fallback={
        <Show when={active() === "browser-agent"} fallback={<Show when={active() === "runs"} fallback={<>
        <div class={`chat-workbench ${contextRailMode() ? "chat-workbench--session-rail" : ""} ${splitOpen() ? "chat-workbench--split" : ""} ${previewEnabled() && previewOpen() ? "chat-workbench--preview" : ""} ${previewCollapsed() ? "chat-workbench--preview-collapsed" : ""} ${filesOpen() ? "chat-workbench--files" : ""} ${filesRailCollapsed() ? "chat-workbench--files-collapsed" : ""} ${inspectorOpen() ? "chat-workbench--inspector" : ""} ${terminalRailOpen() ? "chat-workbench--terminal" : ""}`}><div class="chat-column"><section class="chat-thread">
          <header class="chat-header"><div><strong>{selectedProject()?.name || "Scratch"}</strong><span>{selectedProject()?.isGit ? `${selectedProject()?.branch} · ${selectedProject()?.changedFiles} changed` : "Grok Build workspace"}</span></div><div class="chat-header__actions"><Show when={workspace()}><button class={contextRailMode() === "files" ? "active" : ""} onClick={() => void toggleFilesRail()} title="Browse project files">▤ Files</button></Show><button class={contextRailMode() === "terminal" ? "active" : ""} onClick={toggleTerminalRail} title="Open workspace terminal">{">_ Terminal"}</button><button class={contextRailMode() === "activity" ? "active" : ""} onClick={toggleActivityRail} title="Inspect current task">◌ Activity</button><Show when={previewEnabled()}><button class={contextRailMode() === "preview" ? "active" : ""} onClick={() => void togglePreviewRail()}>◫ Preview</button></Show><button class={splitOpen() ? "active" : ""} onClick={() => void (splitOpen() ? closeSplitConversation() : openLatestSplitConversation())} title="Keep another conversation visible">▥ Split</button><button class={historyOpen() ? "active" : ""} onClick={async () => { const next = !historyOpen(); setHistoryOpen(next); if (next) await refreshHistory() }}>History {chatThreads().filter((thread) => thread.messages.length).length || ""}</button><button onClick={newConversation}>New chat</button><button onClick={useScratchWorkspace}>Agent scratch</button><button onClick={chooseWorkspace}>Open project</button></div></header>
          <Show when={historyOpen()}><section class="chat-history" aria-label="Previous chat sessions"><header><div><strong>Chat history</strong><span>{historyAllWorkspaces() ? "All workspaces" : selectedProject()?.name || "Scratch"}</span></div><button onClick={() => setHistoryOpen(false)}>Close</button></header><div class="chat-history__tools"><input value={historySearch()} onInput={async (event) => { setHistorySearch(event.currentTarget.value); await refreshHistory() }} placeholder="Search conversations…"/><label><input type="checkbox" checked={historyAllWorkspaces()} onChange={async (event) => { setHistoryAllWorkspaces(event.currentTarget.checked); await refreshHistory() }}/> All workspaces</label></div><div><For each={historyResults().filter((thread) => thread.messages.length && !thread.archived)} fallback={<p>No matching chats.</p>}>{(thread) => <article class={thread.id === activeThreadId() ? "active" : ""}><button disabled={running()} onClick={() => void openConversation(thread)}><strong>{thread.pinned ? "📌 " : ""}{thread.title}</strong><span>{new Date(thread.updatedAt).toLocaleString()} · {thread.messages.length} messages · {thread.model || "default"} · {thread.sessionStatus || (thread.sessionId ? "resumable" : "new")}</span></button><div><button onClick={() => void openSplitConversation(thread)} disabled={thread.id === activeThreadId()}>Split</button><button onClick={() => { const title = window.prompt("Conversation name", thread.title); if (title?.trim()) void updateThreadMeta(thread, { title: title.trim() }) }}>Rename</button><button onClick={() => void updateThreadMeta(thread, { pinned: !thread.pinned })}>{thread.pinned ? "Unpin" : "Pin"}</button><button onClick={() => void window.api.conversations.export(thread.id)}>Export</button><button onClick={() => void _forkConversation(thread)}>Fork</button><button onClick={() => void updateThreadMeta(thread, { archived: true })}>Archive</button></div></article>}</For></div></section></Show>
          <div class="chat-messages" ref={messagesElement} onScroll={(event) => { const element = event.currentTarget; userNearBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 100 }}>
            <Show when={messages().length || running()} fallback={<div class="chat-empty"><span class="chat-empty__mark">✦</span><h1>What do you want to build?</h1><p>Ask Grok Build to create, debug, explain, or change code.</p><div><button onClick={() => setPrompt("Review this codebase and suggest the highest-impact improvements.")}>Review this project</button><button onClick={() => setPrompt("Find and fix the most important bug in this codebase.")}>Fix a bug</button><button onClick={() => setPrompt("Add tests for the most critical untested behavior.")}>Add tests</button></div></div>}>
              <For each={messages()}>{(message) => <article class={`chat-message chat-message--${message.role}`}><div class="chat-avatar">{message.role === "assistant" ? "✦" : "You"}</div><div class="chat-message__body"><For each={splitThinking(message.logs)}>{(entry) => <Show when={entry.kind !== "thought"} fallback={<details class="reasoning"><summary>Thought process</summary><pre>{entry.content}</pre></details>}><Show when={entry.kind === "text"} fallback={<pre class="chat-error">{entry.content}</pre>}><RichText content={entry.content} /></Show></Show>}</For><div class="message-actions"><span>{new Date(message.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span><button onClick={() => navigator.clipboard.writeText(splitThinking(message.logs).filter((log) => log.kind !== "thought").map((log) => log.content).join("\n"))}>Copy</button><Show when={message.role === "assistant"}><button onClick={() => { const previous = messages().slice(0, messages().findIndex((entry) => entry.id === message.id)).reverse().find((entry) => entry.role === "user"); if (previous) void run(previous.logs.map((log) => log.content).join("\n")) }}>Retry</button></Show></div></div></article>}</For>
              <Show when={running()}><article class="chat-message chat-message--assistant"><div class="chat-avatar">✦</div><div class="chat-message__body"><Show when={events().length} fallback={<div class="typing-indicator"><i/><i/><i/></div>}><For each={splitThinking(events())}>{(entry) => <Show when={entry.kind !== "thought"} fallback={<details class="reasoning"><summary>Thinking…</summary><pre>{entry.content}</pre></details>}><Show when={entry.kind === "text"} fallback={<pre class="chat-error">{entry.content}</pre>}><RichText content={entry.content} /></Show></Show>}</For></Show></div></article></Show>
            </Show>
          </div>
        </section>
        <Show when={contextRailMode()}>{(mode) => <nav class="context-rail-tabs" aria-label="Session context rail"><span>Session tools</span><button class={mode() === "files" ? "active" : ""} onClick={() => void toggleFilesRail()}>Files</button><button class={mode() === "terminal" ? "active" : ""} onClick={toggleTerminalRail}>Terminal</button><button class={mode() === "activity" ? "active" : ""} onClick={toggleActivityRail}>Activity</button><Show when={previewEnabled()}><button class={mode() === "preview" ? "active" : ""} onClick={() => void togglePreviewRail()}>Preview</button></Show></nav>}</Show>
        <Show when={goal()}>{(currentGoal) => <section class={`goal-banner goal-banner--${currentGoal().status}`}><div><span>GOAL · {currentGoal().status}</span><strong>{currentGoal().objective}</strong><small>{currentGoal().iterations} progress run{currentGoal().iterations === 1 ? "" : "s"}</small></div><div><Show when={currentGoal().status === "active"}><button onClick={() => void run("Continue making the highest-impact progress toward the active goal.")}>Continue</button><button onClick={() => void executeSlashCommand("/goal pause")}>Pause</button></Show><Show when={currentGoal().status === "paused"}><button onClick={() => void executeSlashCommand("/goal resume")}>Resume</button></Show><Show when={currentGoal().status !== "completed"}><button onClick={() => void executeSlashCommand("/goal done")}>Complete</button></Show><button onClick={() => void executeSlashCommand("/goal clear")}>Clear</button></div></section>}</Show>
        <Show when={queuedPrompts().length}><section class="prompt-queue"><span>Queued</span><For each={queuedPrompts()}>{(entry, index) => <div><b>{index() + 1}</b><p>{entry.text}</p><button onClick={() => void replaceQueue(removeQueuedPrompt(queuedPrompts(), entry.id))}>×</button></div>}</For></section></Show>
        <Show when={splitOpen() && splitThread()}>{(thread) => <ConversationSplitPane thread={thread()} onClose={() => void closeSplitConversation()} onFocus={() => void focusSplitConversation()} />}</Show>
        <section class="chat-composer chat-composer--docked" aria-label="Grok Build task composer">
          <div class="chat-composer__context">
            <button class="context-pill" onClick={chooseWorkspace} title={workspace()}><span class="context-pill__icon">⌘</span>{selectedProject()?.name || "Scratch"}</button>
            <Show when={selectedProject()?.isGit}>
              <div class="coding-status-row" aria-label="Workspace coding status">
                <button class="coding-status-row__branch" onClick={() => void navigate("review")} title="Open Git Review">⑂ {selectedProject()?.branch || "detached"}</button>
                <span class="coding-status-row__changes">{selectedProject()?.diffStat || `${selectedProject()?.changedFiles || 0} changed`}</span>
                <button class="coding-status-row__action" onClick={() => void navigate("review")} title="Review changed files">Review</button>
                <button class="coding-status-row__action" onClick={() => void toggleFilesRail()} title="Browse project files">Files</button>
              </div>
            </Show>
            <span class="composer-hint">⌘K palette · / commands · Grok Build edits this workspace</span>
          </div>
          <Show when={slashMatches().length}><div class="slash-palette"><For each={slashMatches()}>{(command, index) => <button class={index() === slashSelection() ? "active" : ""} onMouseDown={(event) => { event.preventDefault(); setPrompt(`/${command.name}${command.usage?.includes("<") ? " " : ""}`); setSlashSelection(0) }}><code>/{command.name}</code><span>{command.description}</span><Show when={command.usage}><small>{command.usage}</small></Show></button>}</For></div></Show>
          <Show when={slashNotice()}><pre class="slash-notice">{slashNotice()}</pre></Show>
          <Show when={attachedFiles().length}><div class="composer-attachments" aria-label="Attached workspace files"><For each={attachedFiles()}>{(file) => <button onClick={() => setAttachedFiles((current) => toggleAttachedFile(current, file))} title="Remove attachment"><span>◇</span>{file.path}<b>×</b></button>}</For><small>{attachedFiles().length}/8 attached</small></div></Show>
          <textarea value={prompt()} onInput={(event) => { setPrompt(event.currentTarget.value); setHistoryIndex(-1); setSlashSelection(0); if (event.currentTarget.value) setSlashNotice("") }} onKeyDown={(event) => { const matches = slashMatches(); if (matches.length && event.key === "ArrowDown") { event.preventDefault(); setSlashSelection((value) => (value + 1) % matches.length) } else if (matches.length && event.key === "ArrowUp") { event.preventDefault(); setSlashSelection((value) => (value - 1 + matches.length) % matches.length) } else if (matches.length && (event.key === "Tab" || event.key === "Enter") && !event.shiftKey) { event.preventDefault(); const command = matches[slashSelection()]; if (command) { const requiresArgs = command.usage?.includes("<"); setPrompt(`/${command.name}${requiresArgs ? " " : ""}`); setSlashSelection(0); if (!requiresArgs && event.key === "Enter") void run(`/${command.name}`) } } else if (event.key === "Enter" && !event.shiftKey && !event.isComposing) { event.preventDefault(); void run() } else if (event.key === "ArrowUp" && (event.currentTarget.selectionStart === 0 || !prompt())) { event.preventDefault(); browsePromptHistory(-1) } else if (event.key === "ArrowDown" && event.currentTarget.selectionStart === prompt().length) { event.preventDefault(); browsePromptHistory(1) } }} placeholder={running() ? "Send another instruction — it will be queued…" : "Ask Grok Build to code, debug, or type / for commands…"} rows={3} />
          <div class="chat-composer__footer">
            <button class="composer-icon" onClick={() => { applyContextRail("files"); setFilesRailCollapsed(false); void refreshFiles() }} title="Attach workspace files">＋</button>
            <label class={`composer-toggle ${thinking() ? "composer-toggle--active" : ""}`} title="Use high reasoning effort"><input type="checkbox" checked={thinking()} onChange={async (event) => { setThinking(event.currentTarget.checked); await window.api.store.set(STORE_KEYS.defaultsThinking, event.currentTarget.checked) }} />◇ Think</label>
            <label class={`composer-toggle ${autoApprove() ? "composer-toggle--warning" : ""}`} title="Allow Grok Build to execute tools without asking"><input type="checkbox" checked={autoApprove()} onChange={async (event) => { setAutoApprove(event.currentTarget.checked); await window.api.store.set(STORE_KEYS.defaultsAutoApprove, event.currentTarget.checked) }} />⚡ Auto</label>
            <label class={`composer-toggle ${moaEnabled() ? "composer-toggle--moa" : ""}`} title={`Run ${moaCandidates()} candidates in parallel and synthesize the best result`}><input type="checkbox" checked={moaEnabled()} onChange={async (event) => { setMoaEnabled(event.currentTarget.checked); await window.api.store.set(STORE_KEYS.moaEnabled, event.currentTarget.checked) }} />⌘ MoA ×{moaCandidates()}</label>
            <select class="composer-model" value={modelPickerValue()} onFocus={() => void refreshModelCatalog()} onChange={(event) => void selectModelValue(event.currentTarget.value)} aria-label="Model">
              <optgroup label="Mixture of Agents"><option value="__moa__:2">MoA · Fast ×2</option><option value="__moa__:3">MoA · Balanced ×3</option><option value="__moa__:5">MoA · Thorough ×5</option><option value="__moa__:8">MoA · Exhaustive ×8</option><Show when={![2,3,5,8].includes(moaCandidates())}><option value={`__moa__:${moaCandidates()}`}>MoA · Custom ×{moaCandidates()}</option></Show></optgroup>
              <optgroup label="Grok Build">
                <option value="">{catalog().defaultModel || "Default model"}</option>
              </optgroup>
              <For each={groupedModelOptions(modelOptions())}>{(group) =>
                <optgroup label={group.label}>
                  <For each={group.options}>{(entry) => <option value={entry.id} disabled={!entry.available}>{entry.available ? entry.label : `${entry.label} — ${entry.reason}`}</option>}</For>
                </optgroup>
              }</For>
            </select>
            <button class="composer-send" disabled={!prompt().trim()} onClick={() => void run()} title={running() ? "Queue instruction (Enter)" : "Send (Enter)"}>{running() ? "+" : "↑"}</button>
            <Show when={running()}><button class="composer-stop" onClick={() => window.api.backend.cancel()} title="Stop current task"><span /></button></Show>
          </div>
        </section>
        </div><Show when={terminalRailOpen()}><ChatTerminalRail workspace={workspace()} command={terminalCommand()} output={terminalOutput()} running={terminalRunning()} onCommand={setTerminalCommand} onRun={() => void runCommand()} onClear={() => setTerminalOutput("")} /></Show><Show when={inspectorOpen()}><TaskInspector running={running()} events={events()} goal={goal()} queuedCount={queuedPrompts().length} model={model() || catalog().defaultModel || ""} workspace={workspace()} approvalMode={autoApprove() ? "Automatic" : advanced().permissionMode === "plan" ? "Plan only" : advanced().permissionMode === "dontAsk" ? "No prompts" : "Interactive"} runs={runs()} onStop={() => void window.api.backend.cancel()} onOpenRuns={() => void navigate("runs")} /></Show><Show when={filesOpen()}><aside class={`project-files-rail ${filesRailCollapsed() ? "project-files-rail--collapsed" : ""}`} aria-label="Project files"><header><div><strong>Project files</strong><span>{selectedProject()?.name || "Scratch"} · {files().length} files</span></div><div class="project-files-actions"><button onClick={() => void refreshFiles()} title="Refresh project files">↻</button><button onClick={() => setFilesRailCollapsed((value) => !value)} title={filesRailCollapsed() ? "Expand files" : "Collapse files"}>{filesRailCollapsed() ? "›" : "‹"}</button><button onClick={() => setFilesOpen(false)} title="Close project files">×</button></div></header><Show when={!filesRailCollapsed()}><div class="project-files-search"><input value={fileSearch()} onInput={(event) => setFileSearch(event.currentTarget.value)} placeholder="Filter files…" aria-label="Filter project files" /></div><div class="project-files-list"><Show when={files().length} fallback={<div class="project-files-empty"><span>▤</span><strong>No files loaded</strong><p>Refresh this project to browse its files.</p><button onClick={() => void refreshFiles()}>Load files</button></div>}><div class="project-files-tree"><ProjectFileTree files={files()} query={fileSearch()} activePath={openFile()} onSelect={(path) => { void selectFile(path); setActive("workspace") }} onPreview={previewFile} /></div><For each={files().filter((file) => file.path.toLowerCase().includes(fileSearch().toLowerCase()))}>{(file) => <button class={`project-file ${openFile() === file.path ? "active" : ""}`} onClick={() => { void selectFile(file.path); setActive("workspace") }}><span class="project-file__icon">{file.path.match(/\.(tsx?|jsx?|css|json|md)$/i) ? "◇" : "□"}</span><span class="project-file__path">{file.path}</span><small>{file.size > 1024 ? `${Math.round(file.size / 1024)} KB` : `${file.size} B`}</small></button>}</For></Show></div><footer><span>Click a file to open it in Workspace</span><button onClick={() => { setFilesOpen(false); setActive("workspace") }}>Open editor</button></footer></Show></aside></Show><Show when={previewEnabled() && previewOpen()}><aside class={`preview-rail ${previewCollapsed() ? "preview-rail--collapsed" : ""}`}><header><div><strong>Preview</strong><span>{previewStatus()}</span></div><div class="preview-actions"><button onClick={async () => { const next = !previewCollapsed(); setPreviewCollapsed(next); await window.api.store.set(STORE_KEYS.layoutPreviewCollapsed, next) }} title={previewCollapsed() ? "Expand preview" : "Collapse preview"}>{previewCollapsed() ? "‹" : "›"}</button><Show when={!previewCollapsed()}><button class={previewDevice() === "desktop" ? "active" : ""} onClick={() => setPreviewDevice("desktop")} title="Desktop">▰</button><button class={previewDevice() === "tablet" ? "active" : ""} onClick={() => setPreviewDevice("tablet")} title="Tablet">▯</button><button class={previewDevice() === "mobile" ? "active" : ""} onClick={() => setPreviewDevice("mobile")} title="Mobile">▯</button><button onClick={() => setPreviewReload((value) => value + 1)} title="Reload">↻</button><button onClick={() => window.api.app.openExternal(previewURL())} title="Open in browser">↗</button></Show><button onClick={() => setPreviewOpen(false)} title="Close preview">×</button></div></header><Show when={!previewCollapsed()}><div class="preview-location"><input value={previewDraft()} onInput={(event) => setPreviewDraft(event.currentTarget.value)} onKeyDown={async (event) => { if (event.key === "Enter") { const value = previewDraft().trim(); if (/^https?:\/\//i.test(value)) { setPreviewURL(value); setPreviewReload((count) => count + 1); setPreviewStatus("Loading…"); await window.api.store.set(STORE_KEYS.previewUrl, value) } } }} /><button onClick={async () => { const value = previewDraft().trim(); if (/^https?:\/\//i.test(value)) { setPreviewURL(value); setPreviewReload((count) => count + 1); setPreviewStatus("Loading…"); await window.api.store.set(STORE_KEYS.previewUrl, value) } }}>Go</button></div><div class={`preview-viewport preview-viewport--${previewDevice()}`}><iframe src={`${previewURL()}${previewURL().includes("?") ? "&" : "?"}grok-preview-reload=${previewReload()}`} title="Coding preview" sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals allow-pointer-lock allow-presentation allow-downloads" onLoad={() => setPreviewStatus("Connected")} /></div></Show></aside></Show></div>
        </>}>
        <RunsPanel runs={runs} onRefresh={async () => setRuns(await window.api.grokRuns.list())} />
        </Show>
        }>
        <BrowserAgentTab
          model={model() || undefined}
          models={catalog().models}
          workspace={workspace() || undefined}
          isRunning={running}
          getEvents={events}
          onRunAgent={(instruction, browserModel) => run(instruction, { ephemeral: true, modelOverride: browserModel })}
          onCancelAgent={() => window.api.backend.cancel()}
        />
        </Show>
        }>
          <RuntimePanel url={localStudioURL()} studio={localStudio()} onUrl={setLocalStudioURL} onSave={() => void saveLocalStudioURL()} />
        </Show>
      }>
        <section class="telegram-panel agent-panel page-panel">
          <header class="page-shell__bar">
            <div class="page-shell__search" />
            <div class="page-shell__identity"><span class="eyebrow">AGENT CONTROL CENTER</span><strong>Your full Grok Build agent</strong><span>Desktop and Telegram share one Grok Build harness.</span></div>
            <div class="page-shell__actions"><span class={`agent-health ${props.backendStatus().available ? "agent-health--ready" : ""}`}>{props.backendStatus().available ? "Harness ready" : "Harness offline"}</span></div>
          </header>
          <nav class="page-tabs" aria-label="Agent sections">
            <button class={agentTab() === "overview" ? "active" : ""} onClick={() => setAgentTab("overview")}>Overview</button>
            <button class={agentTab() === "runtime" ? "active" : ""} onClick={() => setAgentTab("runtime")}>Runtime</button>
            <button class={agentTab() === "sessions" ? "active" : ""} onClick={() => setAgentTab("sessions")}>Sessions</button>
            <button class={agentTab() === "memory" ? "active" : ""} onClick={() => setAgentTab("memory")}>Memory</button>
            <button class={agentTab() === "telegram" ? "active" : ""} onClick={() => setAgentTab("telegram")}>Telegram</button>
            <button class={agentTab() === "commands" ? "active" : ""} onClick={() => setAgentTab("commands")}>Commands</button>
          </nav>
          <Show when={agentTab() === "overview"}>
          <Show when={telegramInbox().pending.length}>
            <div class="runtime-banner">
              {telegramInbox().pending.length} pairing request{telegramInbox().pending.length === 1 ? "" : "s"} waiting.
              <button class="primary" style={{ "margin-left": "12px" }} onClick={() => setAgentTab("telegram")}>Review chats</button>
            </div>
          </Show>
          <p class="page-lede">One persistent agent across desktop and Telegram, using Grok Build as the execution harness with OpenClaw/Hermes-style sessions, queues, delegation, recovery, and safe app actions.</p>
          <div class="agent-status-grid"><article><span>Harness</span><strong>{props.backendStatus().version || "Grok Build CLI"}</strong></article><article><span>Active model</span><strong>{model() || catalog().defaultModel || "Default"}</strong></article><article><span>Current work</span><strong>{runs().some((run) => run.status === "running") ? "Task running" : "Idle"}</strong></article><article><span>Remote channel</span><strong>{telegram().connected ? `@${telegram().username ?? "bot"}${telegram().polling ? " · live" : " · paused"}` : "Not connected"}</strong></article><article><span>Authorized chats</span><strong>{telegramAllowedChats().split(/[\s,]+/).filter(Boolean).length}</strong></article><article><span>Pairing requests</span><strong>{telegramPendingChats().length || "None"}</strong></article></div>
          <div class="agent-quick-actions"><button onClick={async () => { setRuns(await window.api.grokRuns.list()); await refreshTelegram(); setTelegramNotice("Agent health refreshed") }}>Refresh health</button><button class="settings-switch--warning" onClick={() => void window.api.app.restart()}>Restart desktop agent</button></div>
          </Show>

          <Show when={agentTab() === "runtime"}>
          <div class="settings-card"><div><strong>Agent runtime</strong><span>Defaults shared by desktop tasks and the Telegram agent.</span></div><div class="agent-defaults-grid"><label>Model<select value={model()} onChange={async (event) => { setModel(event.currentTarget.value); await window.api.store.set(STORE_KEYS.defaultsModel, event.currentTarget.value) }}><option value="">{catalog().defaultModel || "Grok Build default"}</option><For each={catalog().models}>{(entry) => <option value={entry}>{entry}</option>}</For></select></label><label>Maximum turns<input type="number" min="0" max="100" value={maxTurns()} onInput={async (event) => { const value = Math.min(100, Math.max(0, Number(event.currentTarget.value) || 0)); setMaxTurns(value); await window.api.store.set(STORE_KEYS.defaultsMaxTurns, value) }} /><small>0 uses the CLI default</small></label><label class="settings-switch"><input type="checkbox" checked={thinking()} onChange={async (event) => { setThinking(event.currentTarget.checked); await window.api.store.set(STORE_KEYS.defaultsThinking, event.currentTarget.checked) }} /><span />High reasoning</label><label class="settings-switch"><input type="checkbox" checked={selfVerify()} onChange={async (event) => { setSelfVerify(event.currentTarget.checked); await window.api.store.set(STORE_KEYS.defaultsSelfVerify, event.currentTarget.checked) }} /><span />Verify completed work</label><label class="settings-switch"><input type="checkbox" checked={webSearchEnabled()} onChange={async (event) => { setWebSearchEnabled(event.currentTarget.checked); await window.api.store.set(STORE_KEYS.defaultsWebSearch, event.currentTarget.checked) }} /><span />Web search</label><label class="settings-switch settings-switch--warning"><input type="checkbox" checked={autoApprove()} onChange={async (event) => { setAutoApprove(event.currentTarget.checked); await window.api.store.set(STORE_KEYS.defaultsAutoApprove, event.currentTarget.checked) }} /><span />Automatic approvals</label></div></div>

          <div class="settings-card"><div><strong>Delegation and MoA</strong><span>Native Grok subagents plus private Hermes-style advisor fan-out.</span></div><div class="agent-defaults-grid"><label class="settings-switch"><input type="checkbox" checked={subagentsEnabled()} onChange={async (event) => { setSubagentsEnabled(event.currentTarget.checked); await window.api.store.set(STORE_KEYS.agentSubagents, event.currentTarget.checked) }} /><span />Enable subagents</label><label>Delegation style<select value={delegationMode()} disabled={!subagentsEnabled()} onChange={async (event) => { const value = event.currentTarget.value as "balanced" | "aggressive"; setDelegationMode(value); await window.api.store.set(STORE_KEYS.agentDelegationMode, value) }}><option value="balanced">Balanced</option><option value="aggressive">Proactive parallel</option></select></label><label class="settings-switch"><input type="checkbox" checked={moaEnabled()} onChange={async (event) => { setMoaEnabled(event.currentTarget.checked); await window.api.store.set(STORE_KEYS.moaEnabled, event.currentTarget.checked) }} /><span />Enable Mixture of Agents</label><label>Advisor budget<input type="number" min="200" max="2000" step="100" disabled={!moaEnabled()} value={moaReferenceTokenBudget()} onInput={async (event) => { const value = Math.min(2000, Math.max(200, Number(event.currentTarget.value) || 600)); setMoaReferenceTokenBudget(value); await window.api.store.set(STORE_KEYS.moaReferenceTokenBudget, value) }} /><small>tokens · fluid default 600</small></label></div><p class="provider-notice">Advisors remain private and read-only. One acting aggregator owns implementation and verification, while independent subagents can research, inspect, and test without overlapping edits.</p></div>

          <div class="settings-card"><div><strong>Agent authority</strong><span>Typed, allowlisted controls for the app and preview.</span></div><label class="settings-switch settings-switch--warning"><input type="checkbox" checked={agentAppControls()} onChange={async (event) => { setAgentAppControls(event.currentTarget.checked); await window.api.store.set(STORE_KEYS.agentAppControls, event.currentTarget.checked) }} /><span />Allow safe app controls</label><p class="provider-notice">When enabled, the agent may inspect the rendered preview, open it, and create validated schedules. It cannot read credentials, click arbitrary UI, silently broaden permissions, or escape the selected workspace.</p></div>

          <div class="settings-card"><div><strong>Host control scripts</strong><span>Optional browser and computer-use helpers.</span></div><p class="provider-notice">Helpers are injected into Grok Build only when the script exists. Set GROK_BROWSER_CONTROL, GROK_DESKTOP_CONTROL, and GROK_SEARCH_HELPER, or keep the discovered local tools.</p></div>
          </Show>

          <Show when={agentTab() === "sessions"}>
          <div class="settings-card"><div><strong>Hermes-style session lifecycle</strong><span>Recovery, rewinds, compaction, and optional idle resets for remote agent sessions.</span></div><div class="agent-defaults-grid"><label>Idle reset<input type="number" min="0" max="168" value={sessionIdleHours()} onInput={async (event) => { const value = Math.min(168, Math.max(0, Number(event.currentTarget.value) || 0)); setSessionIdleHours(value); await window.api.store.set(STORE_KEYS.agentSessionIdleHours, value) }} /><small>hours · 0 keeps sessions indefinitely</small></label><div class="agent-lifecycle-list"><span>✓ Crash-safe session resume</span><span>✓ Visible transcript recovery</span><span>✓ Retry and turn rewind</span><span>✓ Bounded context checkpoints</span></div></div><p class="provider-notice">Use <code>/retry</code>, <code>/undo</code>, <code>/compress</code>, and <code>/reasoning</code> from Telegram. Rewinds intentionally start a fresh native Grok session and recover from the corrected visible transcript so removed output cannot leak back in.</p></div>

          </Show>
          <Show when={agentTab() === "memory"}>
          <div class="settings-card"><div><strong>Hybrid soul + long-term memory</strong><span>OpenClaw/Hermes-style identity files layered with DuckBot semantic recall.</span></div><div class="agent-defaults-grid"><label class="settings-switch"><input type="checkbox" checked={memoryStatus()?.enabled ?? true} onChange={async (event) => { await window.api.store.set(STORE_KEYS.memoryEnabled, event.currentTarget.checked); setMemoryStatus(await window.api.memory.status()) }} /><span />Enable DuckBot RAG memory</label><label class="settings-switch settings-switch--warning"><input type="checkbox" checked={telegramMemoryEnabled()} onChange={async (event) => { setTelegramMemoryEnabled(event.currentTarget.checked); await window.api.store.set(STORE_KEYS.memoryTelegramEnabled, event.currentTarget.checked) }} /><span />Use personal memory in Telegram</label><div class="agent-lifecycle-list"><span>{memoryStatus()?.available ? "✓ Semantic brain connected" : "○ Semantic brain unavailable"}</span><span>✓ SOUL, USER, AGENTS, and curated MEMORY files</span><span>✓ Relevant-only recall before each turn</span><span>✓ Episodic capture after successful turns</span></div></div><p class="provider-notice">{memoryStatus()?.error || `Soul files: ${memoryStatus()?.soulDirectory || "initializing"}`}. Telegram access is off by default to prevent personal memories from entering group chats; enable it only for trusted, allowlisted chats.</p></div>

          </Show>
          <Show when={agentTab() === "telegram"}>
          <TelegramConnectionPanel
            status={telegram()}
            allowed={telegramInbox().allowed}
            pending={telegramInbox().pending}
            token={token()}
            notice={telegramNotice()}
            onToken={setToken}
            onConnect={() => void connectTelegram()}
            onReconnect={async () => { setTelegramNotice(""); setTelegram(await window.api.telegram.reconnect()); await refreshTelegram(); setTelegramNotice(telegram().polling ? "Polling restarted" : telegram().error || "Reconnect finished") }}
            onDisconnect={async () => { await window.api.telegram.disconnect(); await refreshTelegram(); setTelegramNotice("Polling paused. Encrypted bot token is kept on disk for reconnect.") }}
            onForget={async () => { await window.api.telegram.forgetToken(); setToken(""); setTelegramInbox({ allowed: [], pending: [] }); await refreshTelegram(); setTelegramNotice("Bot token removed from disk. Paste it again to reconnect.") }}
            onApprove={async (id) => { await window.api.telegram.approveChat(id); await refreshTelegram(); setTelegramNotice(`${id} approved`) }}
            onDeny={async (id) => { await window.api.telegram.denyChat(id); await refreshTelegram(); setTelegramNotice(`${id} denied`) }}
            onRevoke={async (id) => { await window.api.telegram.revokeChat(id); await refreshTelegram(); setTelegramNotice(`${id} revoked`) }}
            onAutoApproveFirst={async (enabled) => { await window.api.telegram.setAutoApproveFirst(enabled); await refreshTelegram() }}
            onOpenBot={() => { const name = telegram().username; if (name) void window.api.app.openExternal(`https://t.me/${name}`) }}
            onOpenBotFather={() => void window.api.app.openExternal("https://t.me/BotFather")}
            onRefresh={() => void refreshTelegram(!telegram().polling)}
            onCopy={(value) => void navigator.clipboard.writeText(value)}
          />
          </Show>
          <Show when={agentTab() === "commands"}>
          <div class="settings-card"><div><strong>Remote commands</strong><span>Full agent control without returning to the desktop.</span></div><div class="agent-command-grid"><code>/help</code><span>Interactive command menu</span><code>/status</code><span>Session, queue, model, project, and harness</span><code>/health</code><span>Quick alias for agent status</span><code>/models</code><span>Choose a model with buttons</span><code>/project</code><span>Choose a project, Scratch, or Agent mode</span><code>/mode</code><span>Fast, balanced, or deep response profile</span><code>/queue</code><span>Inspect queued work</span><code>/steer</code><span>Redirect the active task</span><code>/interrupt</code><span>Stop and replace active work</span><code>/cancel</code><span>Stop this chat’s active task</span><code>/retry</code><span>Retry the previous instruction</span><code>/undo</code><span>Rewind the previous completed turn</span><code>/compress</code><span>Checkpoint and compact old context</span><code>/reasoning</code><span>Override reasoning for this session</span><code>/history</code><span>Recent persistent turns</span><code>/workspace</code><span>Show the active working directory</span><code>/schedules</code><span>Inspect scheduled work</span><code>/new</code><span>Start a clean session</span><code>/restart</code><span>Safely restart Desktop and polling</span></div></div>

          <div class="settings-card"><div><strong>Scheduled autonomy</strong><span>{schedules().length} configured task{schedules().length === 1 ? "" : "s"}.</span></div><div class="agent-schedule-summary"><span>{schedules().filter((task) => task.enabled).length} active</span><button onClick={() => void navigate("scheduled")}>Manage schedules</button></div></div>
          <p class="telegram-note">Telegram is a channel for the same Grok Build agent—not a separate stateless bot. Per-chat sessions, transcript recovery, selected models, projects, queue state, and update offsets persist across app restarts.</p>
          </Show>
        </section>
      </Show>
      }>
        <SettingsPanel
          tab={settingsTab()}
          onTab={setSettingsTab}
          search={settingsSearch()}
          onSearch={setSettingsSearch}
          backend={props.backendStatus()}
          catalog={catalog()}
          modelOptions={modelOptions()}
          oauth={oauthStatus()}
          oauthNotice={oauthNotice()}
          oauthBusy={oauthBusy()}
          onSignIn={(provider) => void signInProvider(provider)}
          onRefreshOauth={() => void refreshOauth()}
          cliPath={cliPath()}
          onCliPath={setCliPath}
          onSaveCli={async () => { const status = await window.api.backend.setPath(cliPath()); setCliNotice(status.available ? `Connected: ${status.version || status.command}` : status.error || "Unavailable"); if (status.available) setCatalog(await window.api.backend.models()) }}
          cliNotice={cliNotice()}
          grokAutoUpdate={grokAutoUpdate()}
          onAutoUpdate={async (value) => { setGrokAutoUpdate(value); await window.api.store.set(STORE_KEYS.autoUpdate, value) }}
          grokUpdateChannel={grokUpdateChannel()}
          onUpdateChannel={async (channel) => { setGrokUpdateChannel(channel); await window.api.store.set(STORE_KEYS.updateChannel, channel) }}
          grokUpdate={grokUpdate()}
          grokUpdateNotice={grokUpdateNotice()}
          onCheckUpdate={async () => { try { const update = await window.api.backend.checkUpdate(); setGrokUpdate(update); setGrokUpdateNotice(update.updateAvailable ? `${update.latestVersion} is available` : `Up to date · ${update.currentVersion}`) } catch (error) { setGrokUpdateNotice(error instanceof Error ? error.message : String(error)) } }}
          onInstallUpdate={async () => { try { setGrokUpdateNotice("Installing update…"); const update = await window.api.backend.installUpdate(grokUpdateChannel()); setGrokUpdate(update); setGrokUpdateNotice(`Updated successfully · ${update.currentVersion}`); setCatalog(await window.api.backend.models()) } catch (error) { setGrokUpdateNotice(error instanceof Error ? error.message : String(error)) } }}
          model={model()}
          onModel={async (value) => { setModel(value); await window.api.store.set(STORE_KEYS.defaultsModel, value) }}
          thinking={thinking()}
          onThinking={async (value) => { setThinking(value); await window.api.store.set(STORE_KEYS.defaultsThinking, value) }}
          autoApprove={autoApprove()}
          onAutoApprove={async (value) => { setAutoApprove(value); await window.api.store.set(STORE_KEYS.defaultsAutoApprove, value) }}
          selfVerify={selfVerify()}
          onSelfVerify={async (value) => { setSelfVerify(value); await window.api.store.set(STORE_KEYS.defaultsSelfVerify, value) }}
          webSearch={webSearchEnabled()}
          onWebSearch={async (value) => { setWebSearchEnabled(value); await window.api.store.set(STORE_KEYS.defaultsWebSearch, value) }}
          maxTurns={maxTurns()}
          onMaxTurns={async (value) => { setMaxTurns(value); await window.api.store.set(STORE_KEYS.defaultsMaxTurns, value) }}
          moaEnabled={moaEnabled()}
          onMoaEnabled={async (value) => { setMoaEnabled(value); await window.api.store.set(STORE_KEYS.moaEnabled, value) }}
          moaCandidates={moaCandidates()}
          onMoaCandidates={async (value) => { setMoaCandidates(value); await window.api.store.set(STORE_KEYS.moaCandidates, value) }}
          moaReferenceModels={moaReferenceModels()}
          onMoaReferenceModels={async (value) => { setMoaReferenceModels(value); await window.api.store.set(STORE_KEYS.moaReferenceModels, value) }}
          moaAggregatorModel={moaAggregatorModel()}
          onMoaAggregatorModel={async (value) => { setMoaAggregatorModel(value); await window.api.store.set(STORE_KEYS.moaAggregatorModel, value) }}
          moaReferenceEffort={moaReferenceEffort()}
          onMoaReferenceEffort={async (value) => { setMoaReferenceEffort(value); await window.api.store.set(STORE_KEYS.moaReferenceEffort, value) }}
          moaAggregatorEffort={moaAggregatorEffort()}
          onMoaAggregatorEffort={async (value) => { setMoaAggregatorEffort(value); await window.api.store.set(STORE_KEYS.moaAggregatorEffort, value) }}
          moaReferenceTokenBudget={moaReferenceTokenBudget()}
          onMoaReferenceTokenBudget={async (value) => { setMoaReferenceTokenBudget(value); await window.api.store.set(STORE_KEYS.moaReferenceTokenBudget, value) }}
          advanced={advanced()}
          onAdvanced={(key, value) => void updateAdvanced(key, value)}
          subagentsEnabled={subagentsEnabled()}
          onSubagents={async (value) => { setSubagentsEnabled(value); await window.api.store.set(STORE_KEYS.agentSubagents, value) }}
          delegationMode={delegationMode()}
          onDelegationMode={async (value) => { setDelegationMode(value); await window.api.store.set(STORE_KEYS.agentDelegationMode, value) }}
          autoLearnEnabled={autoLearnEnabled()}
          onAutoLearnEnabled={async (value) => { setAutoLearnEnabled(value); await window.api.store.set(STORE_KEYS.autoLearnEnabled, value); setAutoLearnStatus(value ? "Waiting for completed turns" : "Disabled") }}
          autoLearnInterval={autoLearnInterval()}
          onAutoLearnInterval={async (value) => { setAutoLearnInterval(value); await window.api.store.set(STORE_KEYS.autoLearnInterval, value) }}
          autoLearnModel={autoLearnModel()}
          onAutoLearnModel={async (value) => { setAutoLearnModel(value); await window.api.store.set(STORE_KEYS.autoLearnModel, value) }}
          autoLearnStatus={autoLearnStatus()}
          previewEnabled={previewEnabled()}
          onPreviewEnabled={async (value) => { setPreviewEnabled(value); setPreviewOpen(value); await window.api.store.set(STORE_KEYS.previewEnabled, value) }}
          previewDraft={previewDraft()}
          onPreviewDraft={setPreviewDraft}
          onSavePreview={async () => { const value = previewDraft().trim(); if (/^https?:\/\//i.test(value)) { setPreviewURL(value); await window.api.store.set(STORE_KEYS.previewUrl, value) } }}
          agentAppControls={agentAppControls()}
          onAgentAppControls={async (value) => { setAgentAppControls(value); await window.api.store.set(STORE_KEYS.agentAppControls, value) }}
          backendToolCommand={backendToolCommand()}
          onBackendToolCommand={setBackendToolCommand}
          backendToolOutput={backendToolOutput()}
          backendToolRunning={backendToolRunning()}
          onRunBackendTool={(command) => void runBackendTool(command)}
          providerSecrets={providerSecrets()}
          endpointDrafts={endpointDrafts()}
          modelDrafts={modelDrafts()}
          secretDrafts={secretDrafts()}
          providerNotices={providerNotices()}
          onEndpointDraft={(id, value) => setEndpointDrafts((old) => ({ ...old, [id]: value }))}
          onModelDraft={(id, value) => setModelDrafts((old) => ({ ...old, [id]: value }))}
          onSecretDraft={(id, value) => setSecretDrafts((old) => ({ ...old, [id]: value }))}
          onSaveProvider={(id) => void saveProvider(id)}
          onSaveSecret={(id) => void saveSecret(id)}
          onTestProvider={async (id) => { const result = await window.api.providerSecrets.test(id); setProviderNotices((old) => ({ ...old, [id]: result.message })) }}
          onRemoveSecret={async (id) => { await window.api.providerSecrets.remove(id); setProviderSecrets(await window.api.providerSecrets.list()) }}
          onRemoveProvider={async (id) => { await window.api.providers.remove(id); setProviderSecrets(await window.api.providerSecrets.list()) }}
          customName={customName()}
          customURL={customURL()}
          customModel={customModel()}
          onCustomName={setCustomName}
          onCustomURL={setCustomURL}
          onCustomModel={setCustomModel}
          onAddProvider={() => void addProvider()}
          onOpenExternal={(url) => void window.api.app.openExternal(url)}
        />
      </Show>
      }>
        <ScheduledPanel
          schedules={schedules()}
          name={scheduleName()}
          at={scheduleAt()}
          prompt={schedulePrompt()}
          repeatMinutes={repeatMinutes()}
          workspace={workspace()}
          onName={setScheduleName}
          onAt={setScheduleAt}
          onPrompt={setSchedulePrompt}
          onRepeat={setRepeatMinutes}
          onCreate={() => void createSchedule()}
          onRun={async (id) => { await window.api.schedules.runNow(id); setSchedules(await window.api.schedules.list()) }}
          onToggle={async (id, enabled) => { await window.api.schedules.toggle(id, enabled); setSchedules(await window.api.schedules.list()) }}
          onRemove={async (id) => { await window.api.schedules.remove(id); setSchedules(await window.api.schedules.list()) }}
        />
      </Show>
      }>
        <SkillsPanel
          skills={skills()}
          search={skillSearch()}
          onSearch={setSkillSearch}
          onRefresh={async () => setSkills(await window.api.skills.list(workspace()))}
          onUseSkill={useSkillInChat}
          workspaceName={selectedProject()?.name || "Scratch"}
        />
      </Show>
      }>
        <TerminalPanel
          workspace={workspace()}
          projectName={selectedProject()?.name || ""}
          command={terminalCommand()}
          output={terminalOutput()}
          running={terminalRunning()}
          onCommand={setTerminalCommand}
          onRun={(command) => void runCommand(command)}
          onClear={() => setTerminalOutput("")}
          onOpenProject={chooseWorkspace}
        />
      </Show>
      }>
        <WorkspacePanel
          workspace={workspace()}
          projectName={selectedProject()?.name || "Scratch"}
          files={files()}
          fileSearch={fileSearch()}
          onFileSearch={setFileSearch}
          openFile={openFile()}
          fileContent={fileContent()}
          fileNotice={fileNotice()}
          onRefresh={() => void refreshFiles()}
          onSelectFile={(path) => void selectFile(path)}
          onContentChange={(value) => { setFileContent(value); setFileNotice("Modified") }}
          onSave={() => void saveFile()}
          onOpenProject={chooseWorkspace}
        />
      </Show>
      }>
        <ReviewPanel
          workspace={workspace()}
          projectName={selectedProject()?.name || "Scratch"}
          branch={selectedProject()?.branch}
          isGit={selectedProject()?.isGit}
          changes={gitChanges()}
          selectedPath={selectedDiff()}
          diff={diffContent()}
          onRefresh={() => void refreshDiff()}
          onSelect={async (path) => { setSelectedDiff(path); setDiffContent(await window.api.workspace.gitDiff(workspace(), path)) }}
          onAction={(path, action) => void applyReviewAction(path, action)}
          onAskReview={askReviewInChat}
          onOpenProject={chooseWorkspace}
        />
      </Show>
      }>
        <ArtifactsPanel artifacts={artifacts} onRefresh={() => void refreshArtifacts()} onOpenThread={(id) => void openArtifactThread(id)} />
      </Show>
    </main>
    <footer class="app-status">
      <b>{props.backendStatus().available ? `Grok Build ${props.backendStatus().version || "ready"}` : "Grok Build offline"}</b>
      <span>{model() || catalog().defaultModel || "default model"}</span>
      <span>{selectedProject()?.name || "no project"}</span>
      <span>⌘K palette</span>
    </footer>
  </div>
}
