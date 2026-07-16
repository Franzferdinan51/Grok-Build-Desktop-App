# Grok Build Desktop

An open-source, local-first desktop workbench for [Grok Build CLI](https://github.com/xai-org/grok-build). It combines an agentic coding chat, project tools, live preview, multi-model routing, schedules, skills, and a protected Telegram interface in one native application for macOS, Windows, and Linux.

The maintained backend is [Franzferdinan51/grok-build](https://github.com/Franzferdinan51/grok-build), with a clean upstream-sync path from xAI. Grok Build remains the sole coding-agent runtime: the desktop app handles presentation, secure provider configuration, and orchestration without adding a competing agent backend.

## What is included

### Agentic coding workspace

- Per-project conversations with streamed output, collapsed reasoning, prompt queues, copy/retry actions, and history recall.
- Start immediately in an isolated Scratch workspace or open an existing project.
- Workspace file browser/editor, contained terminal, Git status, and per-file diffs.
- Fixed header and composer with an independently scrolling chat transcript.
- Collapsible left navigation and right Preview rail with persisted layout preferences.
- Searchable Grok run history, scheduled tasks, project skills, and durable workspace goals.
- Slash-command palette with keyboard completion and dynamically discovered Grok Build skills.
- Configurable reasoning, turn limits, self-verification, web search, subagents, and visible automatic-approval controls.

### Models and authentication

- Model selection is populated from the real `grok models` catalog.
- xAI/Grok OAuth uses Grok Build's official login flow.
- OpenAI Codex subscription OAuth is managed by Hermes and connected to Grok Build through a localhost-only, token-isolated Responses API bridge.
- Available Codex models are discovered after sign-in, written into Grok Build's managed configuration, and refreshed in the desktop and Telegram selectors.
- MiniMax OAuth uses the official [`mmx`](https://github.com/MiniMax-AI/cli) device authorization flow with PKCE and automatic refresh.
- LM Studio, ODS, MiniMax API keys, and arbitrary OpenAI-compatible endpoints can be configured as Grok Build model targets.
- API keys are encrypted with Electron `safeStorage` and injected only into the Grok child process. OAuth tokens remain owned by their respective CLI authentication stores.

### Mixture of Agents and subagents

- Hermes-inspired MoA presets for 2–10 parallel reference models plus a separate acting aggregator.
- Reference models run concurrently in plan-only mode and cannot edit files.
- Provider-specific malformed usage metadata no longer aborts the entire MoA run: affected candidates retry safely with the Grok default, and an isolated candidate failure can be skipped.
- Optional balanced or proactive Grok Build subagent delegation for independent research, inspection, testing, and preview review.
- The primary agent remains responsible for integration and final verification.

### Live coding preview and app controls

- Sandboxed, collapsible Preview rail with desktop, tablet, and mobile widths.
- Built-in local preview server, automatic localhost URL detection, reload, and browser handoff.
- The composer remains usable while Preview is open.
- With **Agent App Controls** enabled, the agent can receive the rendered DOM, visible text, interactive elements, viewport details, and a fresh screenshot.
- Typed, allowlisted agent actions can open Preview and create scheduled tasks; arbitrary UI clicks, hidden commands, credential access, and permission changes are not exposed.

### Telegram

- BotFather-token validation, OS-encrypted storage, polling, timeouts, limits, and clean network errors.
- Pairing requests and explicit chat allowlisting before any task can run.
- Native command registration with `/start`, `/help`, `/menu`, `/run`, `/status`, `/models`, `/model`, `/projects`, `/workspace`, and `/cancel`.
- Inline menus, clickable model selection, project/workspace selection, current-model indicators, cancellation, and plain-message tasks.
- Telegram tasks use the current workspace, appear in Grok run history, and send their result back to the originating authorized chat.
- Use a dedicated BotFather bot. A token already consumed by OpenClaw or another long-polling client cannot simultaneously be polled by this app.

### Learning and automation

- `/learn <URL, path, notes, or workflow>` creates or improves reusable project skills under `.grok/skills/`.
- Bare `/learn` distills the recent conversation.
- Optional automatic learning reviews completed turns for durable corrections, reusable fixes, and incomplete skills while refusing weak lessons.
- Persistent one-time or repeating scheduled Grok Build tasks.
- Optional automatic Grok Build CLI updates through the official native updater, with stable/alpha channels and safe deferral while tasks are active.

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
5. Choose **Agent scratch** for project-free work or **Open project** for an existing codebase.
6. Enable Preview, Telegram, subagents, MoA, agent controls, or automatic learning only when needed.

## Chat workflow

Each workspace has its own locally persisted conversation. Press **Enter** to send, **Shift+Enter** for a new line, and use Up/Down at the input boundary for prompt history. Messages submitted during a run are queued and drained automatically.

Type `/` for local commands. Important commands include:

```text
/new
/model <model-id>
/think [on|off]
/approve [on|off]
/moa [off|2-10]
/goal <objective|status|pause|resume|done|clear>
/learn [URL, path, notes, or workflow]
/preview [on|off]
/workspace
/terminal
/review
/skills
/runs
/scheduled
/settings
/stop
```

Discovered skill commands are passed through to Grok Build.

## Backend contract

Every coding task ultimately uses Grok Build's documented headless interface:

```bash
grok -p "<task>" --cwd "<workspace>" --output-format streaming-json
```

The desktop app adds only verified flags such as `--model`, `--reasoning-effort`, `--max-turns`, `--check`, `--disable-web-search`, `--no-subagents`, and `--yolo` when their corresponding controls are selected.

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
- The app does not automatically load or unload LM Studio models.

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
- [Live Preview](docs/PREVIEW.md)

## License

MIT. Vendored dependencies retain their original notices. Grok Build is Apache-2.0.
