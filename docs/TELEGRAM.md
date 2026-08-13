# Telegram agent

Grok Build Desktop can expose a dedicated BotFather bot as a persistent remote coding agent. Grok Build CLI remains the sole execution harness; the desktop app supplies secure channel routing, per-chat state, progress, queues, and host actions inspired by OpenClaw and Hermes.

## Security and connection

1. Open **Agent → Telegram**. Create a dedicated bot in BotFather, then paste the token.
2. The main process validates it with `getMe`, encrypts it with Electron `safeStorage`, removes stale webhook configuration, registers a short command menu, and starts long polling.
3. Pause polling keeps the encrypted token so **Reconnect** works without pasting again. **Remove token** is the hard forget. Reconnect stops the in-flight `getUpdates` first so a second poller does not 409 itself.
4. Unknown chats become named pairing requests (username / title / chat id). They cannot run tasks until you Approve, Deny, or optionally auto-approve only the first incoming chat. `/start`, `/help`, and `/menu` still return the command menu, `/whoami` returns the chat id, and later unauthorized tasks get a short “still waiting” reminder. `/cancel` replies instead of disappearing.
5. The Agent sidebar opens the Telegram connection surface first. Pairing requests badge the Agent item and refresh without hammering `getMe`.
5. The renderer receives connection metadata, polling diagnostics, and chat labels, but never the bot token after submit.

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
- `/sethome` — deliver completed/failed scheduled results to this chat
- `/home` — show or clear the scheduled home channel
- `/cancel` — stop the active task
- `/security` or `/sandbox` — show the NemoClaw-inspired host policy
- `/security on|off` — enable or disable the policy layer
- `/security approvals on|off` — control approval gating for sensitive tasks
- `/approve` / `/deny` — resolve a held destructive, external, network, or credential-related task
- `/skills` — list the Grok Build skills loaded for the active workspace
- `/tools` — show native, search, browser, desktop-control, and Telegram tool surfaces
- `/repair` — run safe read-only backend, skill, and policy health checks

The Agent tab can optionally reset remote sessions after a configured number of idle hours. A retry, undo, compaction, or idle reset starts a clean native Grok session and supplies only the retained visible context, preventing removed replies or private reasoning from returning through native session state.
- `/menu`, `/help` — show controls

## NemoClaw security mode

The Telegram agent includes an optional host-side policy layer inspired by
[NVIDIA NemoClaw](https://github.com/NVIDIA/NemoClaw) and OpenShell. It keeps a
bounded audit trail, injects a security policy into the agent system prompt,
uses a default network allowlist, and pauses high-risk instructions until the
chat explicitly approves them. This is not a replacement for OpenShell's OS
sandbox; it is the lightweight mode intended for the desktop app. The full
NemoClaw/OpenShell runtime can be added later when the host has enough space
and its dependencies are available.

## Reliability

The update offset is persisted to prevent duplicate processing after restart. Polling errors are logged, stale webhooks are cleared without discarding queued updates, callbacks are acknowledged immediately, and `/status` and `/cancel` remain responsive while a task runs.

Hermes/OpenClaw channel UX is adapted without importing those runtimes:

- Progress and typing stay quiet by default (`disable_notification`). Final replies, pairing, and approvals still notify.
- An incoming task message can be pinned for the turn and reacted 👀 → ✅/❌.
- The bot short description can show Online/Offline while polling is live.
- Groups can require an @mention or a reply before ordinary chatter runs a task.
- Held security approvals offer inline Approve/Deny buttons.
- `/sethome` sends scheduled completion/failure notices to the chosen authorized chat.
