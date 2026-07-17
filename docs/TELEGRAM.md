# Telegram agent

Grok Build Desktop can expose a dedicated BotFather bot as a persistent remote coding agent. Grok Build CLI remains the sole execution harness; the desktop app supplies secure channel routing, per-chat state, progress, queues, and host actions inspired by OpenClaw and Hermes.

## Security and connection

1. Open the **Agent** sidebar tab and paste a dedicated BotFather token into its Telegram remote-agent card.
2. The main process validates it with `getMe`, encrypts it with Electron `safeStorage`, removes stale webhook configuration, and starts long polling.
3. Unknown chats create pairing requests. They cannot run commands until explicitly approved in the desktop app.
4. The renderer receives connection metadata but never the bot token.

Do not reuse a bot token that another OpenClaw, Hermes, or Telegram polling process is actively consuming.

## Agent behavior

The Agent tab is the desktop control plane for the same persistent agent. Runtime model, reasoning, verification, web search, turn budget, subagents, delegation, MoA, safe app controls, schedules, connection state, pairing, and command help live together there. Advanced provider and Grok CLI controls remain in Settings.

- Every approved chat has an independent persisted session, model, project, and bounded visible transcript.
- Plain messages continue that chat's Grok Build session. Native resume failures recover from the bounded transcript.
- Grok Build retains its native tools, permissions, web-search setting, verification, subagents, and optional MoA routing.
- Long replies are split without truncation. Private thinking, MoA advisor content, channel envelopes, and host-action tags are removed from public replies.
- A global FIFO queue protects the single active Grok Build harness. `/steer` prioritizes work and `/interrupt` stops and redirects the current turn.
- When Agent App Controls are enabled, the agent may create schema-validated scheduled work. It never receives credentials or arbitrary desktop authority.

## Commands

- `/run <task>` or a plain message — run or queue work
- `/new` — start a fresh session while keeping the selected model/project
- `/status` — backend, session, model, project, and queue state
- `/models`, `/model <id>` — select a model
- `/project` (or legacy `/projects`) — select a project with buttons
- `/queue` — inspect queued work
- `/steer <instruction>` — prioritize the next turn
- `/interrupt <instruction>` — cancel the active turn and redirect
- `/retry` — remove the previous result and retry its instruction
- `/undo` — rewind the previous completed user/agent turn
- `/compress` — checkpoint older visible context and keep recent turns active
- `/reasoning on|off` — override reasoning for this chat session
- `/history` — show recent public conversation
- `/schedules` — list enabled scheduled work
- `/cancel` — stop the active task

The Agent tab can optionally reset remote sessions after a configured number of idle hours. A retry, undo, compaction, or idle reset starts a clean native Grok session and supplies only the retained visible context, preventing removed replies or private reasoning from returning through native session state.
- `/menu`, `/help` — show controls

## Reliability

The update offset is persisted to prevent duplicate processing after restart. Polling errors are logged, stale webhooks are cleared without discarding queued updates, callbacks are acknowledged immediately, and `/status` and `/cancel` remain responsive while a task runs.
