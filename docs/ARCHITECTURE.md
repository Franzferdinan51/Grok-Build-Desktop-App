# Architecture

## Rule zero

**Grok Build CLI is the sole coding-agent backend.** Electron owns the cross-platform UI, secure local state, project tools, and explicit connectors; it never substitutes another agent runtime.

```text
Electron renderer
  -> context-isolated preload API
  -> Electron main process
       -> Grok Build CLI streaming headless mode (default) or official ACP stdio (explicit opt-in)
       -> protected workspace filesystem / Git / terminal
       -> OS-encrypted secrets and connector settings
```

## Backend maintenance

The app targets the upstream [`xai-org/grok-build`](https://github.com/xai-org/grok-build) CLI as its sole coding-agent backend. No desktop-side fork is shipped; users install Grok Build from xAI and the desktop shell resolves whatever `grok` binary is on `PATH` (or the absolute path set via `GROK_BUILD_PATH`).

The desktop resolver probes a configured binary or `PATH` candidate with `grok --version`. Tasks use the documented command/stream contract; no fake JSON-RPC layer is introduced.

## Workspace lifecycle

The app creates a safe per-user Scratch workspace on first launch so coding can begin without selecting a repository. Users can add persistent projects at any time. Switching projects clears stale editor/diff state and refreshes the active view.

Filesystem reads and writes remain inside the chosen workspace, reject symlink escapes, and ignore bulky generated/vendor directories. Terminal execution is explicit and bounded by time and output limits.

## Models and providers

LM Studio, ODS, MiniMax, and custom OpenAI-compatible services are model targets consumed by Grok Build. The UI edits a managed Grok configuration section, reads the resulting catalog through `grok models`, and sends selection through `grok --model`. It does not create parallel inference paths or automatically load/swap local models.

API keys are encrypted using Electron OS facilities and exposed only to the Grok child process environment. Renderer APIs return metadata, never plaintext secrets.

## Source lineage

Hermes Desktop provides the maintained MIT Electron source/pattern base. OpenClaw, opencode, OpenRoom, Local Studio, and Z.ai ZCode are documented feature/UX references subject to their licenses. See [FEATURES-INSPO.md](FEATURES-INSPO.md).
