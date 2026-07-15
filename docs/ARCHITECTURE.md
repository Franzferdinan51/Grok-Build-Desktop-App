# Architecture

## Overview

**Grok Build Desktop App** is a local-first AI coding desktop application built with **Electron + SolidJS**. It wraps the [xAI Grok Build CLI](https://github.com/xai-org/grok-build) as a sidecar process and provides a polished GUI on top.

```
┌─────────────────────────────────────────────────────────────┐
│                      Electron Main Process                   │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐ │
│  │  Window Mgmt │  │ IPC Handlers │  │ Grok Sidecar Manager│ │
│  │  (BrowserWindow)│ │ (ipcMain)  │  │ (child_process)    │ │
│  └─────────────┘  └──────────────┘  └────────────────────┘ │
│                                              │               │
│                                        grok --headless      │
│                                           --stdio            │
│                                              │               │
│                                    ┌────────▼────────┐      │
│                                    │  Grok CLI Binary│      │
│                                    │  (Rust, headless)│      │
│                                    └─────────────────┘      │
└─────────────────────────────────────────────────────────────┘
                           │ IPC (contextBridge)
┌─────────────────────────────────────────────────────────────┐
│                    Electron Renderer Process                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                 SolidJS Application                    │  │
│  │  ┌──────────┐  ┌───────────────┐  ┌────────────────┐ │  │
│  │  │ Sidebar  │  │  Empty State  │  │  Model Picker  │ │  │
│  │  │ (nav)    │  │  (center)     │  │  (provider UI) │ │  │
│  │  └──────────┘  └───────────────┘  └────────────────┘ │  │
│  │  ┌──────────────────────────────────────────────────┐ │  │
│  │  │              Provider Abstraction Layer           │ │  │
│  │  │  GrokProvider | LMStudioProvider | CodexProvider  │ │  │
│  │  └──────────────────────────────────────────────────┘ │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## Stack Decision: Electron + SolidJS

### Why Electron?

**Electron** is chosen over alternatives (Tauri, Neutralino, WRY) for these reasons:

| Criterion | Electron | Tauri | Neutralino | WRY |
|-----------|----------|-------|-----------|-----|
| Node.js in main process | ✅ | ❌ (Rust only) | ✅ (optional) | ❌ |
| Proven desktop pattern | ✅ (VS Code, Slack, etc.) | ✅ | ❌ (niche) | ❌ |
| SolidJS renderer support | ✅ | ✅ (via WebView) | ✅ | ✅ |
| Bun workspaces support | ✅ | ⚠️ | ⚠️ | ❌ |
| IPC (contextBridge) | ✅ first-class | ✅ (Rust commands) | ⚠️ | ⚠️ |
| Sidecar process model | ✅ (child_process) | ⚠️ (shell) | ✅ | ⚠️ |

**Reference: OpenCode** uses Electron as its desktop shell:
> Source: https://github.com/sst/opencode/blob/dev/packages/desktop/package.json
> File: packages/desktop/package.json (uses `electron@42.3.3`, `electron-vite@^5`, `solid-js`)

**Reference: OpenChamber** also uses Electron for its desktop app:
> Source: https://github.com/openchamber/openchamber
> File: packages/desktop/ (Electron + cross-platform)

### Why SolidJS?

SolidJS is chosen over React for the renderer because:

1. **Fine-grained reactivity** — no virtual DOM diffing, smaller bundle (~7KB vs ~45KB React)
2. **JSX without overhead** — compiles to direct DOM operations
3. **First-class TypeScript** — built-in JSX types, no `React.` boilerplate
4. **Already proven in opencode**:
   > Source: https://github.com/sst/opencode/blob/dev/packages/desktop/package.json
   > `"solid-js": "catalog:"` in workspace dependencies

### Why electron-vite?

`electron-vite` is used instead of raw `electron-builder` + `vite` because:
- Single config file for main/preload/renderer
- Dev server integration for all three processes
- Proper module format handling (CJS preload, ESM main)

> Source: https://github.com/sst/opencode/blob/dev/packages/desktop/electron.vite.config.ts

---

## Process Architecture

### Main Process (`packages/desktop/src/main/`)

- **index.ts** — App entry, window creation, lifecycle
- **ipc.ts** — IPC handler registration (mirrors opencode pattern)
- **sidecar.ts** — Grok CLI lifecycle manager (download, spawn, JSON-RPC over stdio)
- **store.ts** — `electron-store` for persistent settings
- **menu.ts** — Application menu (macOS/Windows/Linux)
- **logging.ts** — `electron-log` wrapper

### Preload (`packages/desktop/src/preload/`)

- **index.ts** — `contextBridge.exposeInMainWorld("api", ...)` — typed API to renderer
- Mirrors opencode pattern:
  > Source: https://github.com/sst/opencode/blob/dev/packages/desktop/src/preload/index.ts

### Renderer (`packages/desktop/src/renderer/`)

- **index.tsx** — SolidJS boot, global state (activeProvider, grokStatus)
- **App.tsx** — Root component: Sidebar + Empty State layout
- **styles.css** — Dark theme, pure CSS (no Tailwind), ~10KB

### Backend Package (`packages/backend/src/`)

- **sidecar-manager.ts** — Re-exports GrokSidecarManager from desktop package
- **providers.ts** — Provider abstraction: GrokProvider, LMStudioProvider, CodexProvider

---

## Sidecar Protocol: Grok CLI + JSON-RPC 2.0

The Grok CLI is a Rust binary that runs as a child process. It speaks JSON-RPC 2.0 over stdio in headless mode:

```bash
grok --headless --stdio
```

### Request/Response

```json
// → Request
{ "jsonrpc": "2.0", "id": 1, "method": "agent/start", "params": { "workspace": "/path/to/project" } }

← Response
{ "jsonrpc": "2.0", "id": 1, "result": { "sessionId": "sess_abc123", "model": "grok-3" } }

← Notification (server-sent, no id)
{ "jsonrpc": "2.0", "method": "agent/message", "params": { "content": "Thinking..." } }
```

> Source: https://github.com/xai-org/grok-build
> Files studied:
> - crates/codegen/xai-grok-shell/src/lib.rs (run_stdio_agent entry point)
> - crates/codegen/xai-grok-shell-bin/src/main.rs (binary composition root)
> - crates/codegen/xai-grok-pager-bin/Cargo.toml (binary + headless mode)

### ACP (Agent Client Protocol)

Grok Build uses **ACP** — xAI's internal agent communication protocol. This is documented in:

> Source: https://github.com/xai-org/grok-build (repository root README)
> See: `crates/codegen/xai-grok-mcp/src/acp_transport.rs` for ACP transport layer

---

## Monorepo Structure

```
Grok-Build-Desktop-App/
├── packages/
│   ├── desktop/          # Electron app (main + preload + renderer)
│   │   ├── src/
│   │   │   ├── main/     # Electron main process
│   │   │   ├── preload/  # contextBridge API
│   │   │   └── renderer/ # SolidJS UI
│   │   ├── electron.vite.config.ts
│   │   └── package.json
│   ├── backend/          # Provider abstraction, sidecar logic
│   │   └── src/
│   │       ├── index.ts
│   │       ├── sidecar-manager.ts
│   │       └── providers.ts
│   └── types/            # Shared TypeScript types
│       └── src/
│           └── index.ts
└── docs/                 # Architecture, providers, features, install
```

---

## IPC Channel Map

| Channel (renderer → main) | Direction | Description |
|---------------------------|-----------|-------------|
| `grok:status` | invoke | Get sidecar running status |
| `grok:start` | invoke | Start grok CLI sidecar |
| `grok:stop` | invoke | Stop grok CLI sidecar |
| `grok:send` | invoke | Send JSON-RPC request, get response |
| `grok:event:{channel}` | send(on) | Subscribe to server-sent events |
| `store:get/set/delete` | invoke | Persistent key-value store |
| `window:minimize/maximize/close` | invoke | Window controls |
| `dialog:open-file` | invoke | Native file picker |
| `menu:set-provider` | send(on) | Menu bar provider selection |

---

## Security

- **Context isolation**: `contextIsolation: true` — renderer cannot access Node.js
- **No nodeIntegration**: `nodeIntegration: false`
- **Sandbox**: `sandbox: true` — renderer process is sandboxed
- **CSP**: Strict Content-Security-Policy in `index.html`
- **IPC validation**: All IPC params are type-checked in handlers

---

## Updates & Auto-Update

Uses `electron-updater` (same as opencode):

> Source: https://github.com/sst/opencode/blob/dev/packages/desktop/package.json
> `"electron-updater": "^6.3.9"`

Releases are distributed via GitHub Releases. The updater checks for new versions on startup and on a timer.
