# Grok Build Desktop

Cross-platform, local-first coding workbench powered exclusively by **Grok Build CLI**. The maintained backend is [Franzferdinan51/grok-build](https://github.com/Franzferdinan51/grok-build), with a clean sync path from `xai-org/grok-build`.

## Highlights

- Electron desktop app for macOS, Windows, and Linux, based on MIT-licensed Hermes Desktop patterns.
- Grok Build CLI is the sole coding-agent backend using documented streaming headless mode.
- Start immediately in an automatic Scratch workspace or open a Git project.
- Project explorer/editor, terminal, Git changes and per-file diffs.
- LM Studio, ODS, MiniMax, and unlimited OpenAI-compatible endpoints as first-class Grok model targets.
- Editable endpoints/model IDs, encrypted API keys, provider diagnostics, and selectable Grok CLI binary.
- Skills browser, searchable run history, persistent schedules, Local Studio monitoring, and Telegram connection.
- Path containment, symlink rejection, terminal limits, explicit approvals, and no automatic model loading.
- Hermes-style persistent project chats with streamed messages, collapsed reasoning, prompt queues, history recall, copy/retry actions, and a bottom-docked composer.
- Optional Dyad-style live preview beside the chat, with automatic dev-server URL detection, responsive device widths, reload, and browser handoff.

## Chat workflow

Each workspace has its own locally persisted conversation. Grok Build output streams into the thread, `thought` events and `<think>…</think>` blocks stay collapsed by default, and a second instruction entered during a run is queued and drained automatically. Press **Enter** to send, **Shift+Enter** for a new line, use arrow up/down at the input boundary to browse prompt history, and choose **New chat** to clear only the active workspace conversation.

## Install

```bash
git clone https://github.com/Franzferdinan51/Grok-Build-Desktop-App.git
cd Grok-Build-Desktop-App
pnpm install
curl -fsSL https://x.ai/cli/install.sh | bash
pnpm dev
```

Set `GROK_BUILD_PATH` when `grok` is not on `PATH`, or choose the binary in Settings.

## Backend contract

Every coding task runs through Grok Build:

```bash
grok -p "<task>" --cwd "<workspace>" --output-format streaming-json
```

The model picker reads `grok models` and adds `--model` when selected. Reasoning and auto-approval map to documented Grok flags. Provider credentials are OS-encrypted and injected only into the Grok child process.

Our fork can be updated from official xAI upstream with:

```bash
pnpm sync:grok-upstream
```

## Design sources

- [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) — MIT Electron shell and desktop patterns; retained under `upstream/hermes`.
- [openclaw/openclaw](https://github.com/openclaw/openclaw) — MIT product/UX reference for skills, schedules, channels, approvals, and settings.
- [anomalyco/opencode](https://github.com/anomalyco/opencode) — MIT workspace/provider UX reference.
- [MiniMax-AI/OpenRoom](https://github.com/MiniMax-AI/OpenRoom) — MIT local-first organization reference.
- [Z.ai ZCode](https://zcode.z.ai/en) — closed-source product reference only; no code or assets copied.
- [sybil-solutions/local-studio](https://github.com/sybil-solutions/local-studio) — Apache-2.0 runtime-monitoring patterns.
- [dyad-sh/dyad](https://github.com/dyad-sh/dyad) — Apache-2.0 live-preview workflow and responsive viewport patterns.

## Docs

- [Architecture](docs/ARCHITECTURE.md)
- [Providers](docs/PROVIDERS.md)
- [Feature sources](docs/FEATURES-INSPO.md)
- [Cross-platform contract](docs/PLATFORM-PARITY.md)
- [Install](docs/INSTALL.md)
- [Telegram](docs/TELEGRAM.md)
- [Testing and release checks](docs/TESTING.md)
- [Live preview](docs/PREVIEW.md)

## Verification

```bash
pnpm test:smoke   # CLI, reasoning parsing, filesystem sandbox, terminal, Git review
pnpm typecheck
pnpm build
pnpm package      # signed installers/artifacts for the current platform
```

The smoke suite creates an isolated temporary Git workspace and never modifies a real project. Provider and Telegram live tests require credentials and are initiated explicitly from their settings pages.

## License

MIT. Vendored dependencies retain their original notices. Grok Build is Apache-2.0.
