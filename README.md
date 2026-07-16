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

## Docs

- [Architecture](docs/ARCHITECTURE.md)
- [Providers](docs/PROVIDERS.md)
- [Feature sources](docs/FEATURES-INSPO.md)
- [Cross-platform contract](docs/PLATFORM-PARITY.md)
- [Install](docs/INSTALL.md)
- [Telegram](docs/TELEGRAM.md)

## License

MIT. Vendored dependencies retain their original notices. Grok Build is Apache-2.0.
