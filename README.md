# Grok Build Desktop

An open-source, local-first desktop agent built on [Grok Build CLI](https://github.com/xai-org/grok-build). It combines autonomous coding, general-purpose agent work, persistent conversations, project tools, live preview, multi-model routing, schedules, skills, MoA, subagents, and a full Telegram agent in one native application for macOS and Windows.

Grok Build remains the sole coding-agent runtime: the desktop app handles presentation, secure provider configuration, and orchestration without adding a competing agent backend.

## Current highlights

- **Autonomous by default:** desktop, Telegram, and scheduled turns use Grok Build's real tool loop and can edit, run, test, and verify instead of stopping at a plan.
- **Project or project-free:** use a repository, temporary Scratch space, or a persistent **Agent (no project)** working directory.
- **Persistent continuity:** conversations, checkpoints, model/workspace affinity, native session IDs, queues, recovery context, and interrupted work survive relaunches.
- **Lightweight history loading:** compact conversation metadata sidecars populate session lists, while only the selected transcript is loaded into the workbench.
- **Remote agent:** Telegram includes pairing, queues, steering, interruption, lifecycle controls, rich formatting, live progress, model/project pickers, and private reasoning. Hermes/OpenClaw channel UX is adapted as quiet progress, 👀/✅/❌ reactions, pin-during-turn, Online/Offline presence, group @mention gating, approval buttons, and `/sethome` scheduled delivery.
- **Telegram security mode:** NemoClaw-inspired host policy with default-deny guidance, sensitive-task approvals, bounded audit events, secret-leak prevention, `/security`, `/sandbox`, `/approve`, and `/deny`—without replacing the Grok Build harness with OpenShell.
- **Research-ready skills:** Bundled skills install into the local Grok skill directory for Tavily, Brave, X search via `xurl`, private SearXNG, BrowserOS/browser-control, source verification, and tool discovery. Private endpoints and credentials stay local and are never committed.
- **DuckBot-primary durable memory:** OpenClaw/Hermes-style `SOUL.md`, `USER.md`, `AGENTS.md`, and curated `MEMORY.md` files provide identity and policy, while the local [duckbot-rag-memory](https://github.com/Franzferdinan51/duckbot-rag-memory) layer is the primary long-term recall/capture store. Its injected context is deliberately bounded; Telegram use remains explicit opt-in.
- **Provider choice:** xAI, OpenAI Codex OAuth, MiniMax OAuth/API, NVIDIA Build/NIM, OpenRouter, LM Studio, ODS, and OpenAI-compatible endpoints.
- **Built and tested cross-platform:** macOS arm64 DMG/ZIP artifacts and Windows x64 NSIS installers are produced by the release workflow. macOS signing depends on the machine's configured Apple identity.

## What is included

### Agentic coding workspace

- Atomic per-conversation storage with sanitized rich Markdown, streamed output, one consolidated and bounded reasoning panel per assistant turn, prompt queues, copy/retry actions, global search, rename, pin, archive, export, model/session labels, and cross-workspace history.
- Persisted multi-session workspace view: keep a second saved conversation visible in a read-only pane for comparison or monitoring, then focus it when you are ready to work; execution remains serialized through the Grok Build backend.
- Start in a persistent general-purpose Agent workspace, an isolated Scratch workspace, or an existing project.
- Workspace file tree/editor, contained terminal with command history, Git review tree with highlighted diffs, and master-detail Skills/Scheduled pages.
- Fixed header and composer with an independently scrolling chat transcript; every non-chat page, including the full Settings catalog, has its own reliable viewport scroll.
- Grok session IDs are bound to each conversation and workspace and resume across turns, stops, relaunches, and project switches. Token-aware visible-only context and automatic checkpoints recover long conversations without injecting thoughts, advisor transcripts, preview DOM, action tags, or tool noise.
- The Advanced session controls also expose Grok Build's verified `--continue` path for explicitly continuing the most recent native session; it takes precedence over an explicit session UUID.
- Collapsible left navigation and right Preview rail with persisted layout preferences.
- Searchable Grok run history, scheduled tasks, project skills, official Rhai workflows, and durable workspace goals.
- Scheduled runs now create distinct persisted conversations; **Open last result** returns to the transcript and native session for review or continuation.
- DuckBot RAG Memory is the primary desktop memory source; recall is bounded to relevant local context, while Grok Build's duplicate default memory is disabled unless experimental memory is explicitly selected.
- Agent → Memory includes explicit DuckBot brain diagnostics (`brain_stats`) and a bounded `brain_wake_up` preview for inspecting session context without adding either call to the normal fast task path.
- Run History is an actionable session inspector: open the owning conversation, resume a verified native session, fork a run, stop the active run, or copy bounded diagnostics.
- If the Electron main process restarts during a task, Run History marks the run **Interrupted · outcome unknown**, preserves a bounded last-known activity tail, and requires an explicit review before resume or fork.
- Slash-command palette with keyboard completion and dynamically discovered Grok Build skills and workflows.
- Global Quick Entry (`CommandOrControl+Shift+Space`) opens a secure, always-on-top composer from anywhere and routes submissions into the current or a new saved conversation.
- Workspace file attachments let you select up to eight files from the project rail or drop known workspace files directly onto the composer; only files already returned by the safe workspace listing are accepted and their relative paths become explicit agent context.
- Action-oriented Git Review now supports per-file stage/unstage controls, staged-diff inspection, and confirmed discard for tracked changes.
- Git Review stays synchronized after a task settles, when the selected project changes, and when the app regains focus; the selected diff is retained when its file still exists.
- Background task completion and failure also surface as native desktop notifications when the workbench is unfocused; clicking one restores the existing app window.
- The Task Inspector includes a durable, per-workspace checklist for breaking work into explicit user-controlled steps alongside the active Grok Build goal.
- The Task Inspector also shows verified backend phases for startup, advisor consultation, execution, recovery, completion, cancellation, and failure; phase labels come from the Grok Build bridge rather than UI guesses.
- Scheduled Grok Build work now reports live running phases and final failures back to the Scheduled page, with background completion/failure notifications and the last error retained for recovery.
- The Artifacts page indexes links, files, and images mentioned in persisted conversations, with search, type filters, and direct links back to the originating chat.
- The session dock keeps up to four saved conversations visible as read-only tabs; focus one to continue working in it without introducing a second agent runtime.
- Git projects expose a quick Worktree toggle beside branch status; it applies the existing verified Grok Build worktree flags to the next task and remains configurable in Advanced Settings.
- The expandable Worktrees overview reports the repository's main, linked, and detached worktrees with read-only paths and branch labels.
- Existing linked worktrees can be adopted with **Use**, registering that path as a project and switching the workbench without changing Git state.
- The coding chat now coordinates Files, Terminal, Activity, and Preview through one session context rail, so switching tools keeps the conversation mounted and makes the active context obvious.
- The Activity inspector presents a bounded, expandable timeline of response, reasoning, and error updates instead of an unstructured log tail.
- If the renderer reloads while Grok Build is still running, the workbench reattaches to the active task, restores its bounded visible output and session ID, and keeps new instructions queued until it finishes.
- Git Review can now open from that same session context rail, keeping the active conversation visible while inspecting and staging workspace changes; the dedicated Review page remains available for full-screen work.
- Long streamed conversations now expose a sticky **Jump to latest** control when you scroll upward, so you can inspect earlier output without losing the live tail.
- Quitting while Grok Build is actively working now requires an explicit confirmation, so an accidental app close cannot silently cancel an in-flight task.
- Configurable reasoning, turn limits, self-verification, web search, subagents, and visible automatic-approval controls.

### Models and authentication

- Model selection is populated from the real `grok models` catalog.
- xAI/Grok OAuth uses Grok Build's official login flow.
- OpenAI Codex subscription OAuth is managed by Hermes and connected to Grok Build through a localhost-only, token-isolated Responses API bridge.
- Available Codex models are discovered after sign-in, written into Grok Build's managed configuration, and refreshed in the desktop and Telegram selectors.
- MiniMax OAuth uses the official [`mmx`](https://github.com/MiniMax-AI/cli) device authorization flow with PKCE and automatic refresh.
- NVIDIA Build/NIM, OpenRouter, LM Studio, ODS, MiniMax API keys, and arbitrary OpenAI-compatible endpoints can be configured as first-class Grok Build model targets. Provider-native model IDs containing slashes are supported.
- API keys are encrypted with Electron `safeStorage` and injected only into the Grok child process. OAuth tokens remain owned by their respective CLI authentication stores.

### Mixture of Agents and subagents

- Hermes-inspired MoA presets for 2–8 parallel reference models plus a separate acting aggregator, matching Hermes' worker cap.
- Reference models run concurrently in plan-only mode without tools, receive recent conversation context, and cannot edit files.
- Reference and aggregator reasoning effort can be tuned independently. Reference failures are isolated instead of aborting a healthy aggregation.
- Reference context is bounded to avoid operating-system argument limits; if every advisor is unavailable, the acting aggregator continues instead of discarding the user's task.
- Advisor output uses Hermes' fluid 600-token budget by default (configurable from 200–2,000), while the acting aggregator remains uncapped.
- One acting aggregator receives those analyses, runs in autonomous execution mode, edits the workspace, executes commands, and verifies the finished implementation; it is explicitly prevented from stopping at another plan.
- Provider-specific null numeric metadata and metadata-only Responses API control frames are normalized by the maintained Grok backend without changing the selected model.
- MoA never silently substitutes the Grok default for a chosen reference model; an isolated failed reference is reported and skipped while successful selected references continue.
- Optional balanced or proactive Grok Build subagent delegation for independent research, inspection, testing, and preview review.
- The Task Inspector shows a compact live subagent roster sourced from Grok Build's verified spawn/completion events, with bounded labels, status, duration, and tool counts; child reasoning remains out of the main chat transcript.
- The primary agent remains responsible for integration and final verification.

### Live coding preview and app controls

- Sandboxed, collapsible Preview rail with desktop, tablet, and mobile widths.
- Built-in local preview server, automatic localhost URL detection, reload, and browser handoff.
- The composer remains usable while Preview is open.
- With **Agent App Controls** enabled, the agent can receive the rendered DOM, visible text, interactive elements, viewport details, and a fresh screenshot.
- Typed, allowlisted agent actions can open Preview and create scheduled tasks; arbitrary UI clicks, hidden commands, credential access, and permission changes are not exposed.

### Agent control center and Telegram

- A dedicated **Agent** sidebar tab combines Grok Build runtime defaults, model choice, reasoning, verification, delegation, MoA, safe app authority, scheduled autonomy, and the Telegram connection in one control center.
- BotFather-token validation, OS-encrypted storage, polling, timeouts, limits, and clean network errors.
- Pairing requests and explicit chat allowlisting before any task can run.
- Persistent per-chat Grok Build agent sessions with model/working-directory affinity, bounded transcript recovery, FIFO queues, long-response chunking, and private-reasoning removal.
- `/project` offers **Agent (no project)**, temporary Scratch, and saved projects. Agent mode uses a durable general-purpose working directory and does not require a Git repository.
- Telegram responses support safe rich formatting for headings, emphasis, links, inline code, fenced code blocks, status messages, and inline keyboards. Long output is split at readable boundaries.
- Native commands include `/run`, `/new`, rich `/status`, `/models`, `/model`, `/project`, `/workspace`, `/mode`, `/queue`, `/steer`, `/interrupt`, `/history`, `/schedules`, `/menu`, `/cancel`, and `/restart`; inline buttons update task context immediately.
- Per-chat response profiles keep the agent fluid without removing capabilities: Fast uses the direct Grok Build agent, Balanced applies a short adaptive MoA consultation to substantial tasks, and Deep uses the full configured council.
- DuckBot RAG stays warm in a persistent local process, avoiding repeated Python/model startup latency while preserving semantic recall and graceful fallback.
- Hermes-style lifecycle commands add `/retry`, `/undo`, `/compress`, and per-session `/reasoning`, with optional idle resets and corrected-transcript recovery after rewinds.
- `/models` exposes Hermes-style **MoA Balanced** and **MoA Deep** presets alongside direct models; selecting a direct model disables MoA for that chat.
- Telegram tasks retain Grok Build tools, web search, verification, subagents, optional MoA, run history, progress updates, and schema-validated scheduling when Agent App Controls are enabled.
- DuckBot RAG is auto-detected from common local install locations and enabled by default for desktop/scheduled agent work. It degrades safely to filesystem soul files if the local embedding service is offline. Personal memory access from Telegram is a separate, explicit opt-in because authorized group chats may contain other people.
- When an encrypted NVIDIA Build/NIM key is configured, DuckBot RAG can use NVIDIA's `nvidia/nemotron-3-embed-1b` embedding model through the same provider boundary. Switching embedding models requires re-indexing the existing vector store; vectors from different models must not be mixed.
- Use a dedicated BotFather bot. A token already consumed by OpenClaw or another long-polling client cannot simultaneously be polled by this app.

### Learning and automation

- `/learn <URL, path, notes, or workflow>` creates or improves reusable project skills under `.grok/skills/`.
- Bare `/learn` distills the recent conversation.
- Optional automatic learning reviews completed turns for durable corrections, reusable fixes, and incomplete skills while refusing weak lessons.
- Persistent one-time or repeating scheduled Grok Build tasks.
- Optional automatic Grok Build CLI updates through the official native updater, with stable/alpha channels and safe deferral while tasks are active.

### Full Grok Build backend controls

- Native custom agent selection and inline subagent-definition JSON.
- Permission modes, repeatable allow/deny rules, built-in tool allow/disable lists, sandbox profiles, and automatic approvals.
- Default, experimental cross-session, or disabled memory modes.
- Appended rules, system-prompt overrides, verbatim prompts, prompt files, and JSON content-block prompts.
- New Git worktrees with optional names/base refs, explicit session UUIDs, resumed-session forks, and original-code restoration.
- JSON Schema-constrained structured output rendered directly in chat.
- A shell-free backend toolbox for MCP servers, plugins and marketplaces, memory, session search/export, worktrees, traces, setup/inspection, completions, authentication, and the Agent Dashboard.
- The backend toolbox discovers the installed Grok Build command catalog at runtime, keeps one-click presets read-only or help-oriented, and falls back safely when the CLI is unavailable.
- The Advanced settings toolbox also renders the live `grok --help` catalog; each discovered command can open its own CLI help without hard-coding a stale upstream command list.

## Install

### Prerequisites

- Node.js 20+
- pnpm 9+
- Grok Build CLI
- Optional: Hermes Agent for OpenAI Codex subscription OAuth
- Optional: MiniMax `mmx` CLI for MiniMax OAuth

```bash
git clone https://github.com/Franzferdinan51/Grok-Build-Desktop-App.git
cd Grok-Build-Desktop-App
pnpm install
curl -fsSL https://x.ai/cli/install.sh | bash
grok --version
pnpm dev
```

If `grok` is not available on the GUI application's `PATH`, set `GROK_BUILD_PATH` or choose the binary in **Settings → Grok Build CLI backend**.

Production artifacts are generated with:

```bash
pnpm package
```

Output is written to `packages/desktop/dist`.

## First-run setup

1. Open **Settings** and confirm the Grok Build CLI status is ready.
2. Sign in with xAI, or configure another model provider.
3. For OpenAI Codex, install Hermes, choose **Sign in with OpenAI**, and finish the browser flow. The usable Codex models are imported automatically.
4. For MiniMax, install `mmx`, choose **Sign in with MiniMax**, and finish device authorization.
5. Choose **Agent (no project)** for persistent general-purpose work, **Scratch** for temporary isolated work, or **Open project** for an existing codebase.
6. Use the Agent tab to configure Telegram, subagents, MoA, safe app controls, and shared desktop/remote runtime defaults; enable Preview or automatic learning only when needed.

Bundled research skills are installed on first launch. Configure private providers
locally, never in GitHub:

```text
TAVILY_API_KEY=<local secret>
BRAVE_API_KEY=<local secret>
SEARXNG_URL=<private/local endpoint>
```

The Telegram agent also recognizes authenticated `xurl` and the verified
BrowserOS/browser-control helper when they are installed.

## Chat workflow

Each conversation is stored atomically outside the settings file and owns its workspace, selected model, transcript, checkpoint, and resumable Grok session. The **Workbench** view is where you continue the selected conversation and run tasks; it is separate from the **New chat** action in the chat header, which archives the current conversation in History and starts a clean backend session. Press **Enter** to send, **Shift+Enter** for a new line, and use Up/Down at the input boundary for prompt history. Messages submitted during a run are queued and drained automatically. Stopping a run preserves partial output and continuity for the next instruction.

Press **⌘K** (Ctrl+K on Windows) for the command palette: jump to views, chats, models, and slash commands. Type `/` in the composer for local commands. Important commands include:

```text
/new
/model <model-id>
/think [on|off]
/approve [on|off]
/moa [off|2-8]
/goal <objective|status|pause|resume|done|clear>
/learn [URL, path, notes, or workflow]
/preview [on|off]
/workspace
/terminal
/review
/skills
/workflows
/plan [description|off]
/view-plan
/workflow <name|pause|resume|stop> [args]
/deep-research <query>
/dashboard
/doctor [cli]
/runs
/scheduled
/settings
/stop
/retry
/undo
/export
/copy
/queue [clear]
/compress
```

Discovered skill commands are passed through to Grok Build.

## Telegram agent workflow

Connect a dedicated BotFather bot in the **Agent** tab, send `/start`, and approve the pending chat ID in the desktop app. One bot token must have only one active polling owner.

```text
/menu                 rich control panel
/status               backend, model, session, queue, and working directory
/models               inline model selector
/moa                  MoA settings and Balanced/Deep presets
/security             NemoClaw-inspired policy status
/sandbox              alias for /security
/approve              approve a held sensitive task
/deny                 deny a held sensitive task
/project              Agent, Scratch, or saved-project selector
/run <instruction>    execute an agent turn
/steer <instruction>  prioritize the next turn
/interrupt <task>     stop current work and redirect
/queue                 inspect pending work
/retry                 rerun the previous instruction
/undo                  remove the previous visible turn
/compress              checkpoint older context
/reasoning on|off      per-chat reasoning override
/history               recent visible conversation
/schedules             enabled scheduled work
/new                   fresh session, same model and working directory
/cancel                cancel active work
/restart               restart the desktop agent and Telegram polling
```

Plain messages run as agent instructions. Every authorized chat has independent model, working directory, transcript, checkpoint, and resumable Grok session state.

## Backend contract

Every coding task ultimately uses Grok Build's documented headless interface:

```bash
grok -p "<task>" --cwd "<workspace>" --output-format streaming-json
```

The desktop app adds only verified Grok flags for the selected controls, including model, reasoning effort, turn limits, verification, web search, subagents, permissions, memory, sandboxing, rules, worktrees, session recovery, and structured output.

Advanced settings also expose an opt-in authenticated ACP transport (`grok agent stdio`). It uses the local `grok login` session, streams native ACP session/tool updates, and pauses the desktop on a bounded approval dialog when Grok requests a permission. Denials fail closed; `bypassPermissions` can be explicitly selected for unattended work. Headless streaming-json remains the default and is the supported path for structured browser planning, MoA advisor runs, schedules, and API-key environments.

The app expects the maintained backend fork because several third-party Responses-compatible providers emit harmless extension control frames such as `response.metadata`. The fork ignores those non-content frames while retaining xAI upstream behavior.

Managed provider entries are written only inside the marked **GROK BUILD DESKTOP MANAGED PROVIDERS** block in `~/.grok/config.toml`; hand-written configuration outside that block is preserved.

To sync the maintained Grok Build fork with xAI upstream:

```bash
pnpm sync:grok-upstream
```

## Security boundaries

- Workspace file operations reject traversal and escaping symlinks.
- Preview content runs in a sandboxed iframe without Electron or Node access.
- Telegram requires explicit pairing/allowlisting and never exposes its token to the renderer.
- Provider API keys use OS encryption; OAuth tokens are not copied into desktop settings.
- Agent App Controls are opt-in, typed, and allowlisted.
- Automatic approvals are visibly marked because they reduce interactive safety prompts.
- NemoClaw/OpenShell is not installed or required. The Telegram policy layer preserves the existing Grok Build CLI and harness.
- Search credentials and private SearXNG endpoints are read only from local configuration/environment and are never included in skills, README files, or commits.
- The app does not automatically load or unload LM Studio models.
- Conversation history can branch from a selected user instruction into a fresh Grok Build session while preserving the earlier visible turns and pre-filling the selected instruction for editing.

## Verification

```bash
pnpm typecheck
pnpm test:smoke
pnpm build
pnpm package
```

The smoke suite uses temporary workspaces and validates the CLI/model catalog, chat parsing, filesystem containment, symlink rejection, terminal behavior, Preview serving, Git status, and diffs. Live provider and Telegram checks require user credentials and are initiated explicitly.

## Project structure

```text
packages/desktop/       Electron + Solid desktop application
docs/                   Architecture, providers, Telegram, Preview, and testing guides
scripts/                Upstream synchronization helpers
upstream/hermes/        Retained MIT Hermes reference sources and notices
```

## Design and implementation references

- [xai-org/grok-build](https://github.com/xai-org/grok-build) — coding-agent backend and headless/model contracts.
- [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) — MIT desktop, MoA, OAuth, and agent-workflow patterns.
- [NVIDIA/NemoClaw](https://github.com/NVIDIA/NemoClaw) — security-policy and approval patterns; only the lightweight host-side policy layer is used here.
- [openclaw/openclaw](https://github.com/openclaw/openclaw) — channel, scheduling, skills, model-routing, and OAuth reference patterns.
- [MiniMax-AI/cli](https://github.com/MiniMax-AI/cli) — official MiniMax OAuth and runtime integration.
- [dyad-sh/dyad](https://github.com/dyad-sh/dyad) — Apache-2.0 live-preview patterns.
- [anomalyco/opencode](https://github.com/anomalyco/opencode) — MIT workspace/provider UX reference.
- [sybil-solutions/local-studio](https://github.com/sybil-solutions/local-studio) — Apache-2.0 local runtime-monitoring patterns.

No third-party branding, proprietary assets, or unsupported provider behavior is presented as native functionality.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Providers](docs/PROVIDERS.md)
- [Feature-source matrix](docs/FEATURES-INSPO.md)
- [Cross-platform contract](docs/PLATFORM-PARITY.md)
- [Install and build](docs/INSTALL.md)
- [Telegram](docs/TELEGRAM.md)
- [Testing and release checks](docs/TESTING.md)
- [Search providers and private configuration](docs/SEARCH-PROVIDERS.md)
- [Live Preview](docs/PREVIEW.md)

## License

MIT. Vendored dependencies retain their original notices. Grok Build is Apache-2.0.
