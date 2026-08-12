# Feature-source matrix

This table distinguishes verified upstream evidence from inspiration. It prevents the app from presenting a mock or undocumented feature as if it already works.

| Source | Verified upstream evidence | Chosen implementation | Explicitly not copied / claimed |
| --- | --- | --- | --- |
| [xai-org/grok-build](https://github.com/xai-org/grok-build) | Rust coding agent; headless mode accepts `-p`, `--cwd`, `--output-format streaming-json`; supports documented sessions, permission flags, MCP, skills, hooks, and ACP | Grok Build is the execution backend; stream its documented headless JSON events into the desktop UI | A custom `--stdio` JSON-RPC API; no such contract is used here |
| [Grok Build headless guide](https://github.com/xai-org/grok-build/blob/main/crates/codegen/xai-grok-pager/docs/user-guide/14-headless-mode.md) | `--reasoning-effort`, `--always-approve`, `--resume`, JSON and streaming JSON output are documented | Explicit reasoning and auto-approve controls map only to those documented flags | Hidden permission escalation or a vague “full authorization” switch |
| [anomalyco/opencode](https://github.com/anomalyco/opencode) | MIT coding agent; desktop app is published as beta; source separates desktop/application concerns | Electron desktop-shell patterns, workspace-first task UX | Its branding, code, or a claim that it is the backend |
| [MiniMax-AI/OpenRoom](https://github.com/MiniMax-AI/OpenRoom) | MIT browser desktop with an agent action system; local browser data model | Dense, application-like navigation and explicit actions | MiniMax Code proprietary UI/assets or a claim that MiniMax Agent is open source |
| [openclaw/openclaw](https://github.com/openclaw/openclaw) | Personal assistant gateway with Telegram among supported channels | Telegram is modeled as a protected integration with explicit routing boundaries | Shipping OpenClaw inside this app or bypassing its channel controls |
| [Oct1AtJoe/zcode-desktop](https://github.com/Oct1AtJoe/zcode-desktop) | MIT community floating monitor for ZCode local token/task state | Future local task/usage monitor concept | Official ZCode desktop source or product identity |
| [dyad-sh/dyad](https://github.com/dyad-sh/dyad) | Apache-2.0 app builder with a sandboxed iframe preview, reload controls, and responsive viewport modes | Optional collapsible preview rail alongside Grok chat, URL detection, device widths, and external-browser handoff | Dyad branding, proprietary `src/pro` code, app-generation backend, or preview instrumentation |
| [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) | MIT desktop exposes configurable Mixture of Agents reference-model and aggregator presets | MoA control surface and visible candidate count, executed by Grok Build's native headless `--best-of-n` implementation | Hermes gateway, model router, provider identity, or recursive MoA provider |
| [Franzferdinan51/OpenMausBotRemix](https://github.com/Franzferdinan51/OpenMausBotRemix) | MIT multi-bot chat shell with a searchable jump palette and provider availability rail | Cmd/Ctrl-K command palette and dimmed/unconfigured model options in the existing Grok Build picker | Its harness server, extra agent runtimes, Composio marketplace, cloud computers, or branding |
| [Franzferdinan51/Duck-Agent](https://github.com/Franzferdinan51/Duck-Agent) | Grok Build-primary CLI plus a Hermes-derived desktop design system (flat surfaces, tokens, chat-as-home, overlay elevation, and a session-scoped project file tree) | `/workflow`, `/doctor`, shared CSS tokens, status bar, command-palette elevation, and the chat-side expandable Project Files tree backed by the existing workspace IPC/editor | Replacing this Solid/Electron workbench with the Duck-Agent React/Hermes shell, Duck Agent branding, or a second agent runtime |

## Product choices made from the research

- **Local-first:** LM Studio is a real configuration surface and the app avoids model load commands by default.
- **Grok first:** every coding task is executed by Grok Build, not an Electron “sidecar agent.”
- **Telegram:** implemented as an encrypted, explicit bot connection. No inbound auto-run without an allowlist.
- **Visual direction:** a dark, compact coding workbench inspired by the supplied MiniMax screenshot, without copying its plan/upsell UI or assets.
- **Duck-Agent integration boundary:** the Project Files rail is intentionally a focused UI integration. It reuses the app's existing workspace file listing and editor handoff, so the desktop remains Grok Build-primary and does not import Duck-Agent's separate React runtime.

## Sources checked but not selected as a base

- MiniMax public repositories found during research include [Mini-Agent](https://github.com/MiniMax-AI/Mini-Agent) and OpenRoom. Neither was treated as a drop-in desktop coding-agent backend.
- The official ZCode desktop application source was not found. `Oct1AtJoe/zcode-desktop` is a third-party monitor and is labeled as such.
