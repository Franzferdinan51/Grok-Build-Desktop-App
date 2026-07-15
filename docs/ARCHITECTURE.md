# Architecture

## Rule zero

**Grok Build is the coding-agent backend.** The canonical desktop client is now the vendored MIT OpenClaw macOS application. It supplies the desktop information architecture; it does not replace Grok Build with a parallel coding agent.

```text
OpenClaw macOS (SwiftUI/AppKit) — canonical UI base
  ├─ dashboard, channels, skills, schedules, approvals, settings, gateway health
  └─ GrokBuildCodingView
       └─ GrokBuildBackend ── spawn documented headless Grok Build command
            grok -p <prompt> --cwd <folder> --output-format streaming-json

Electron/Solid remains in `packages/` as a migration reference; it is not the
canonical product path.
```

## Execution flow

1. User selects a workspace and enters a coding task in the native Grok Build Coding window.
2. `GrokBuildBackend` starts `grok` with the upstream-documented flags.
3. Each newline from `streaming-json` is presented in the native task output.
4. The UI shows output, completion, and errors without exposing Grok credentials.

This is deliberately a task-process model. Grok Build’s upstream repository also contains ACP support, but this app does not claim an undocumented ACP wire contract. ACP can become a later adapter only after compatibility testing against a released Grok Build version.

## Provider strategy

- **Grok Build:** primary coding agent and tool executor.
- **LM Studio:** first-class local model endpoint. The app stores a configurable endpoint and keeps its role visible, but it does not force-load models. That prevents accidental VRAM churn and preserves user control.
- **Other clouds:** not part of the execution path in this iteration. A provider must have a real backend integration before appearing as an executable choice.

## Permission model

The default run does not add `--yolo`. The visible “Auto-approve tools” switch explicitly adds it for that one task. This maps directly to Grok Build’s documented flag and avoids a misleading “full authorization” label.

## Telegram

Telegram is an optional channel integration, not an implicit data sink. OpenClaw's
native channel architecture is the foundation. The direct Bot API bridge in the
Electron transition prototype remains transitional until its allowlist and
credential flow are mapped into the native channel settings:

- token validation and credential storage must remain explicit and local.
- outbound sends must be user-initiated or covered by an explicit allowlist.
- inbound task routing stays disabled until an allowlist is finished.

## Source audit

See [FEATURES-INSPO.md](FEATURES-INSPO.md) for the chosen ideas and upstream evidence. Earlier JSON-RPC and “sidecar” claims were removed because the verified Grok Build headless interface is command + JSON event streaming.
