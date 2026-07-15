/**
 * App.tsx — Main SolidJS application component
 *
 * Layout mirrors the MiniMax Code / OpenChamber "empty state" screenshot:
 *  - Left sidebar: New task, Search, Skills, Scheduled, Mobile section,
 *    Pinned / Scheduled / Projects sections, Plus Plan footer
 *  - Center: empty state with model picker (Thinking toggle, Full Authorization toggle),
 *    file-type attachers (Slides, PDF, Docs, Excel)
 *
 * Dark theme throughout. Styled with plain CSS (no Tailwind dependency)
 * to keep the bundle small.
 */

import { createSignal, For, Show, type Accessor } from "solid-js"
import "./styles.css"

// ── Types ─────────────────────────────────────────────────────────────────────

type Provider = "grok" | "lmstudio" | "openai" | "codex"
type GrokStatus = { running: boolean; error?: string; pid?: number }

// ── Sidebar item definitions ──────────────────────────────────────────────────

type SidebarItem = {
  id: string
  label: string
  icon: string  // emoji or text
  badge?: string | number
}

type SidebarSection = {
  id: string
  title?: string
  items: SidebarItem[]
}

const SIDEBAR_SECTIONS: SidebarSection[] = [
  {
    id: "actions",
    items: [
      { id: "new-task", label: "New task", icon: "✏️" },
      { id: "search", label: "Search", icon: "🔍" },
      { id: "skills", label: "Skills", icon: "🛠️" },
      { id: "scheduled", label: "Scheduled", icon: "📅" },
    ],
  },
  {
    id: "mobile",
    title: "Mobile",
    items: [
      { id: "mobile-session", label: "Mobile session", icon: "📱" },
    ],
  },
  {
    id: "pinned",
    title: "Pinned",
    items: [
      { id: "pinned-1", label: "grok-build integration", icon: "📌" },
      { id: "pinned-2", label: "lm-studio setup", icon: "📌" },
    ],
  },
  {
    id: "scheduled",
    title: "Scheduled",
    items: [
      { id: "scheduled-1", label: "Daily standup prep", icon: "⏰" },
    ],
  },
  {
    id: "projects",
    title: "Projects",
    items: [
      { id: "proj-1", label: "Grok-Build-Desktop-App", icon: "📁" },
      { id: "proj-2", label: "my-other-project", icon: "📁" },
    ],
  },
]

// ── Model definitions ─────────────────────────────────────────────────────────

const PROVIDERS: { id: Provider; label: string; icon: string; description: string }[] = [
  {
    id: "grok",
    label: "Grok (xAI)",
    icon: "🤖",
    description: "xAI Grok via grok CLI — cloud-first with sandbox support",
  },
  {
    id: "lmstudio",
    label: "LM Studio",
    icon: "💻",
    description: "Local LLMs via OpenAI-compatible API — http://100.116.54.125:1234",
  },
  {
    id: "codex",
    label: "Codex (OpenAI)",
    icon: "⚡",
    description: "OpenAI Codex via OAuth — full coding agent capabilities",
  },
  {
    id: "openai",
    label: "OpenAI GPT",
    icon: "🌐",
    description: "GPT-4o via OpenAI API — general-purpose reasoning",
  },
]

// ── File attacher icons ───────────────────────────────────────────────────────

const ATTACHERS = [
  { id: "slides", label: "Slides", icon: "📊" },
  { id: "pdf", label: "PDF", icon: "📄" },
  { id: "docs", label: "Docs", icon: "📝" },
  { id: "excel", label: "Excel", icon: "📋" },
]

// ── App component ─────────────────────────────────────────────────────────────

type AppProps = {
  activeProvider: Accessor<string>
  setActiveProvider: (p: string) => void
  grokStatus: Accessor<GrokStatus>
}

export function App(props: AppProps) {
  const [thinking, setThinking] = createSignal(false)
  const [fullAuth, setFullAuth] = createSignal(false)
  const [sidebarCollapsed, setSidebarCollapsed] = createSignal(false)
  const [activeSection, setActiveSection] = createSignal("new-task")

  return (
    <div class="app-root">
      {/* ── Left Sidebar ──────────────────────────────────────────────── */}
      <aside class={`sidebar ${sidebarCollapsed() ? "sidebar--collapsed" : ""}`}>
        {/* Sidebar header */}
        <div class="sidebar__header">
          <Show when={!sidebarCollapsed()}>
            <span class="sidebar__app-name">Grok Build</span>
          </Show>
          <button
            class="sidebar__collapse-btn"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed())}
            title={sidebarCollapsed() ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed() ? "→" : "←"}
          </button>
        </div>

        {/* Navigation sections */}
        <nav class="sidebar__nav">
          <For each={SIDEBAR_SECTIONS}>
            {(section) => (
              <div class="sidebar__section">
                <Show when={section.title && !sidebarCollapsed()}>
                  <span class="sidebar__section-title">{section.title}</span>
                </Show>
                <For each={section.items}>
                  {(item) => (
                    <button
                      class={`sidebar__item ${activeSection() === item.id ? "sidebar__item--active" : ""}`}
                      onClick={() => setActiveSection(item.id)}
                      title={sidebarCollapsed() ? item.label : ""}
                    >
                      <span class="sidebar__item-icon">{item.icon}</span>
                      <Show when={!sidebarCollapsed()}>
                        <span class="sidebar__item-label">{item.label}</span>
                      </Show>
                    </button>
                  )}
                </For>
              </div>
            )}
          </For>
        </nav>

        {/* Sidebar footer — Plus Plan */}
        <div class="sidebar__footer">
          <Show when={!sidebarCollapsed()}>
            <div class="sidebar__plus-plan">
              <span class="plus-plan__badge">⭐</span>
              <div class="plus-plan__text">
                <span class="plus-plan__label">Plus Plan</span>
                <span class="plus-plan__sub">Unlimited Grok sessions</span>
              </div>
              <button class="plus-plan__cta">Upgrade</button>
            </div>
          </Show>
          <Show when={sidebarCollapsed()}>
            <button class="sidebar__item" title="Plus Plan">
              <span class="sidebar__item-icon">⭐</span>
            </button>
          </Show>

          {/* Grok status indicator */}
          <div
            class={`grok-status grok-status--${props.grokStatus().running ? "online" : "offline"}`}
            title={props.grokStatus().running ? `Grok running (pid ${props.grokStatus().pid})` : props.grokStatus().error ?? "Grok offline"}
          >
            <span class="grok-status__dot" />
            <Show when={!sidebarCollapsed()}>
              <span class="grok-status__label">
                {props.grokStatus().running ? "Grok Online" : "Grok Offline"}
              </span>
            </Show>
          </div>
        </div>
      </aside>

      {/* ── Main Content ───────────────────────────────────────────────── */}
      <main class="main-content">
        {/* Empty state — matches MiniMax Code screenshot vibe */}
        <div class="empty-state">
          <div class="empty-state__logo">🤖</div>
          <h1 class="empty-state__title">What would you like to build?</h1>
          <p class="empty-state__subtitle">
            Ask Grok to code, debug, or explore your codebase
          </p>

          {/* Model picker */}
          <div class="model-picker">
            <span class="model-picker__label">Provider</span>
            <div class="model-picker__options">
              <For each={PROVIDERS}>
                {(p) => (
                  <button
                    class={`model-picker__option ${props.activeProvider() === p.id ? "model-picker__option--active" : ""}`}
                    onClick={() => props.setActiveProvider(p.id)}
                    title={p.description}
                  >
                    <span class="model-picker__option-icon">{p.icon}</span>
                    <span class="model-picker__option-label">{p.label}</span>
                  </button>
                )}
              </For>
            </div>
          </div>

          {/* Toggles */}
          <div class="toggles">
            <label class="toggle" title="Enable extended thinking (uses more tokens)">
              <input
                type="checkbox"
                checked={thinking()}
                onChange={(e) => setThinking(e.currentTarget.checked)}
              />
              <span class="toggle__track">
                <span class="toggle__thumb" />
              </span>
              <span class="toggle__label">Thinking</span>
            </label>

            <label class="toggle" title="Grant full file system and tool access">
              <input
                type="checkbox"
                checked={fullAuth()}
                onChange={(e) => setFullAuth(e.currentTarget.checked)}
              />
              <span class="toggle__track">
                <span class="toggle__thumb" />
              </span>
              <span class="toggle__label">Full Authorization</span>
            </label>
          </div>

          {/* File attachers */}
          <div class="file-attachers">
            <For each={ATTACHERS}>
              {(attacher) => (
                <button class="file-attacher" title={`Attach ${attacher.label}`}>
                  <span class="file-attacher__icon">{attacher.icon}</span>
                  <span class="file-attacher__label">{attacher.label}</span>
                </button>
              )}
            </For>
          </div>

          {/* Input area */}
          <div class="input-area">
            <textarea
              class="input-area__textarea"
              placeholder="Describe a task, paste code, or ask a question..."
              rows={4}
            />
            <button class="input-area__submit" disabled>
              Send
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}
