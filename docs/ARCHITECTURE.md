# Architecture

## Rule zero

**Grok Build is the coding-agent backend.** Electron and Solid are the desktop client around it; they do not replace the agent, create a parallel orchestration backend, or pretend Grok Build exposes an API it does not document.

```text
Solid renderer
  │ secure contextBridge IPC
Electron main process
  ├─ GrokBuildBackend ── spawn documented headless Grok Build command
  │       grok -p <prompt> --cwd <folder> --output-format streaming-json
  ├─ TelegramBridge ── Telegram Bot API (encrypted local credential)
  └─ local settings ── electron-store
```

## Execution flow

1. User selects a workspace and enters a coding task.
2. Renderer invokes `backend:run`; it has no direct Node, filesystem, token, or child-process access.
3. `GrokBuildBackend` starts `grok` with the upstream-documented flags.
4. Each newline from `streaming-json` is parsed and forwarded as a constrained `backend:event` to the renderer.
5. The UI shows text, thoughts, completion, and errors without exposing Grok credentials.

This is deliberately a task-process model. Grok Build’s upstream repository also contains ACP support, but this app does not claim an undocumented ACP wire contract. ACP can become a later adapter only after compatibility testing against a released Grok Build version.

## Provider strategy

- **Grok Build:** primary coding agent and tool executor.
- **LM Studio:** first-class local model endpoint. The app stores a configurable endpoint and keeps its role visible, but it does not force-load models. That prevents accidental VRAM churn and preserves user control.
- **Other clouds:** not part of the execution path in this iteration. A provider must have a real backend integration before appearing as an executable choice.

## Permission model

The default run does not add `--yolo`. The visible “Auto-approve tools” switch explicitly adds it for that one task. This maps directly to Grok Build’s documented flag and avoids a misleading “full authorization” label.

## Telegram

Telegram is an optional bot integration, not an implicit data sink:

- `getMe` validates a token before it is persisted.
- token material is encrypted using Electron `safeStorage`; the renderer never reads it back.
- outbound sends are explicit IPC calls.
- inbound task routing needs a future allowlist and is intentionally disabled in this foundation.

## Source audit

See [FEATURES-INSPO.md](FEATURES-INSPO.md) for the chosen ideas and upstream evidence. Earlier JSON-RPC and “sidecar” claims were removed because the verified Grok Build headless interface is command + JSON event streaming.
