# Features Inspiration Matrix

This document maps every feature we plan to build to its source(s) in our reference repositories. Every row cites a GitHub URL and a local file path (for files we actually read).

---

## Feature Comparison Table

| # | Feature | Source | Source URL | Local File Path |
|---|---------|--------|-----------|-----------------|
| 1 | **Dark theme sidebar + empty state** | MiniMax Code screenshot (Duckets' description) | N/A (user-shared screenshot) | N/A |
| 2 | **Model picker with provider toggle (Thinking / Full Authorization)** | MiniMax Code screenshot (same as #1) | N/A | N/A |
| 3 | **File-type attachers (Slides/PDF/Docs/Excel)** | MiniMax Code screenshot (same as #1) | N/A | N/A |
| 4 | **Electron + SolidJS + electron-vite** | opencode v2 desktop package | https://github.com/sst/opencode/blob/dev/packages/desktop/package.json | `/tmp/opencode/packages/desktop/package.json` |
| 5 | **Sidecar process pattern (child_process + IPC)** | opencode desktop sidecar | https://github.com/sst/opencode/blob/dev/packages/desktop/src/main/sidecar.ts | `/tmp/opencode/packages/desktop/src/main/sidecar.ts` |
| 6 | **IPC handler registration pattern (ipcMain.handle)** | opencode IPC handlers | https://github.com/sst/opencode/blob/dev/packages/desktop/src/main/ipc.ts | `/tmp/opencode/packages/desktop/src/main/ipc.ts` |
| 7 | **contextBridge / preload API** | opencode preload script | https://github.com/sst/opencode/blob/dev/packages/desktop/src/preload/index.ts | `/tmp/opencode/packages/desktop/src/preload/index.ts` |
| 8 | **electron-vite multi-entry (main + sidecar rollup input)** | opencode electron.vite.config.ts | https://github.com/sst/opencode/blob/dev/packages/desktop/electron.vite.config.ts | `/tmp/opencode/packages/desktop/electron.vite.config.ts` |
| 9 | **Branchable chat timeline (/undo, /redo, fork)** | OpenChamber core features | https://github.com/openchamber/openchamber/blob/main/README.md | `/tmp/openchamber/README.md` |
| 10 | **Smart tool UIs (diffs, file operations, permissions)** | OpenChamber tool UIs | https://github.com/openchamber/openchamber/blob/main/README.md | `/tmp/openchamber/README.md` |
| 11 | **Plan/Build mode (plan view + build view)** | OpenChamber plan/build | https://github.com/openchamber/openchamber/blob/main/README.md | `/tmp/openchamber/README.md` |
| 12 | **Git workflows in-app (commit, PR, checks)** | OpenChamber git workflows | https://github.com/openchamber/openchamber/blob/main/README.md | `/tmp/openchamber/README.md` |
| 13 | **GitHub Issues/PR context in sessions** | OpenChamber GitHub-native | https://github.com/openchamber/openchamber/blob/main/README.md | `/tmp/openchamber/README.md` |
| 14 | **Integrated terminal (per-directory sessions)** | OpenChamber terminal | https://github.com/openchamber/openchamber/blob/main/README.md | `/tmp/openchamber/README.md` |
| 15 | **Skills catalog + local skill management** | OpenChamber skills | https://github.com/openchamber/openchamber/blob/main/README.md | `/tmp/openchamber/README.md` |
| 16 | **Multi-agent runs with isolated worktrees** | OpenChamber multi-agent | https://github.com/openchamber/openchamber/blob/main/README.md | `/tmp/openchamber/README.md` |
| 17 | **Inline comment drafts on diffs/files** | OpenChamber inline comments | https://github.com/openchamber/openchamber/blob/main/README.md | `/tmp/openchamber/README.md` |
| 18 | **Context visibility (token/cost breakdowns)** | OpenChamber context visibility | https://github.com/openchamber/openchamber/blob/main/README.md | `/tmp/openchamber/README.md` |
| 19 | **Voice mode (speech input + read-aloud)** | OpenChamber voice mode | https://github.com/openchamber/openchamber/blob/main/README.md | `/tmp/openchamber/README.md` |
| 20 | **Desktop: multiple native windows** | OpenChamber desktop | https://github.com/openchamber/openchamber/blob/main/README.md | `/tmp/openchamber/README.md` |
| 21 | **Desktop: floating Mini Chat (always-on-top)** | OpenChamber floating chat | https://github.com/openchamber/openchamber/blob/main/README.md | `/tmp/openchamber/README.md` |
| 22 | **Codebase context architecture** | Cody (Sourcegraph) context | https://github.com/sourcegraph/cody-public-snapshot | `/tmp/cody/README.md` |
| 23 | **MCP (Model Context Protocol) server support** | grok-build MCP | https://github.com/xai-org/grok-build | `/tmp/grok-build/crates/codegen/xai-grok-mcp/src/lib.rs` |
| 24 | **Headless + stdio CLI mode** | grok-build headless | https://github.com/xai-org/grok-build | `/tmp/grok-build/crates/codegen/xai-grok-shell-bin/src/main.rs` |
| 25 | **Sandbox file operations** | grok-build sandbox | https://github.com/xai-org/grok-build | `/tmp/grok-build/crates/codegen/xai-grok-sandbox/src/lib.rs` |
| 26 | **Rust workspace, ACP protocol** | grok-build architecture | https://github.com/xai-org/grok-build | `/tmp/grok-build/Cargo.toml` |
| 27 | **Tray + chat + node mode** | OpenClaw desktop | https://github.com/openclaw/openclaw | `/tmp/openclaw/README.md` |
| 28 | **Gateway as control plane** | OpenClaw gateway | https://github.com/openclaw/openclaw | `/tmp/openclaw/docs/gateway.md` |
| 29 | **Skill workshop + reusable skills** | OpenClaw skills | https://github.com/openclaw/openclaw (skill workshop) | N/A |
| 30 | **electron-log + file rotation** | opencode logging | https://github.com/sst/opencode/blob/dev/packages/desktop/src/main/logging.ts | `/tmp/opencode/packages/desktop/src/main/logging.ts` |
| 31 | **electron-store for persistent settings** | opencode store | https://github.com/sst/opencode/blob/dev/packages/desktop/src/main/store.ts | `/tmp/opencode/packages/desktop/src/main/store.ts` |
| 32 | **Application menu (File/Edit/View/Provider/Window/Help)** | opencode menu | https://github.com/sst/opencode/blob/dev/packages/desktop/src/main/menu.ts | `/tmp/opencode/packages/desktop/src/main/menu.ts` |
| 33 | **electron-window-state for window position/size** | opencode window state | https://github.com/sst/opencode/blob/dev/packages/desktop/package.json | `/tmp/opencode/packages/desktop/package.json` |
| 34 | **electron-updater for auto-updates** | opencode updater | https://github.com/sst/opencode/blob/dev/packages/desktop/package.json | `/tmp/opencode/packages/desktop/package.json` |
| 35 | **OAuth / token-based auth for Codex** | OpenAI OAuth / Cody auth | https://github.com/sourcegraph/cody-public-snapshot | N/A |

---

## Feature Details & Source Notes

### 1-3: MiniMax Code UI (Duckets' Screenshot)

No GitHub source — this is a user-shared screenshot. The description of the UI elements:
- Left sidebar: New task / Search / Skills / Scheduled / Mobile + Pinned / Scheduled / Projects / Plus Plan footer
- Center: empty state with model picker (Thinking toggle, Full Authorization toggle)
- File attachers: Slides, PDF, Docs, Excel
- Dark theme throughout

Implemented in: `packages/desktop/src/renderer/App.tsx` + `styles.css`

### 4-8: opencode Desktop Pattern

**Source:** https://github.com/sst/opencode/tree/dev/packages/desktop

Key files read:
- `packages/desktop/package.json` — Electron 42.3.3, SolidJS, electron-vite
- `packages/desktop/electron.vite.config.ts` — multi-entry rollup config with sidecar
- `packages/desktop/src/main/index.ts` — app lifecycle, window creation
- `packages/desktop/src/main/sidecar.ts` — child_process spawn + IPC to renderer
- `packages/desktop/src/main/ipc.ts` — ipcMain.handle registrations
- `packages/desktop/src/preload/index.ts` — contextBridge API

The opencode architecture is the **primary template** for our Electron + SolidJS + electron-vite stack.

### 9-21: OpenChamber Features

**Source:** https://github.com/openchamber/openchamber

Key areas:
- **Plan/Build mode** (feature #11): Dedicate a plan-view panel for drafting before implementation
- **Multi-agent worktrees** (feature #16): Isolated git worktrees per agent, safe parallel runs
- **Skills catalog** (feature #15): `.agents/skills/` directory with reusable automation
- **Voice mode** (feature #19): Web Speech API for input, SpeechSynthesis for output
- **Floating Mini Chat** (feature #21): Browser/PWA can float as small window

### 22: Cody Codebase Context

**Source:** https://github.com/sourcegraph/cody-public-snapshot

Cody's context architecture is the gold standard for codebase-aware AI:
- Embeddings-based retrieval
- Hybrid search (keyword + semantic)
- Precise code navigation (LSIF)
- We'll implement a simplified version: file-tree index + BM25/semantic search

### 23-26: grok-build (Rust CLI)

**Source:** https://github.com/xai-org/grok-build

Key files read:
- `Cargo.toml` — Rust workspace layout, crate closure
- `crates/codegen/xai-grok-pager-bin/Cargo.toml` — binary composition root
- `crates/codegen/xai-grok-shell-bin/src/main.rs` — headless + stdio entry points
- `crates/codegen/xai-grok-shell/src/lib.rs` — agent runtime with `run_stdio_agent`

Protocol: ACP (Agent Client Protocol) over stdio in headless mode.

### 27-29: OpenClaw

**Source:** https://github.com/openclaw/openclaw

- **Tray mode**: System tray icon with quick-access menu
- **Node mode**: Connects to remote machines (Ryan's Mac mini)
- **Gateway as control plane**: Local HTTP server that routes agent traffic

### 30-34: opencode Infrastructure

These are standard desktop app infrastructure borrowed directly from opencode:
- `electron-log` for file + console logging
- `electron-store` for JSON settings persistence
- Application menu with Provider submenu
- `electron-window-state` for saving window position/size
- `electron-updater` for GitHub-release-based auto-update

---

## Implementation Status

| Feature | Status | File(s) |
|---------|--------|---------|
| 1-3 MiniMax UI | ✅ Done | `renderer/App.tsx`, `renderer/styles.css` |
| 4-8 Stack setup | ✅ Done | `package.json`, `electron.vite.config.ts` |
| 9-21 OpenChamber | 🔜 Future | Planned |
| 22 Cody context | 🔜 Future | Planned |
| 23-26 Grok CLI sidecar | ✅ Done | `main/sidecar.ts`, `main/ipc.ts` |
| 27-29 OpenClaw | 🔜 Future | Planned |
| 30-34 Infrastructure | ✅ Done | `main/logging.ts`, `main/store.ts`, `main/menu.ts` |
