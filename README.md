# Grok Build Desktop

Local-first desktop workbench for **Grok Build**. Grok Build is the coding-agent backend; this project provides the desktop UI, secure local integrations, workspace state, and model controls around it.

## What is implemented

- **Grok Build backend** — runs the documented headless interface: `grok -p … --output-format streaming-json`. The renderer receives real text, thought, end, and error events over Electron IPC.
- **Grok-first coding flow** — workspace picker, prompt composer, stream output, reasoning-effort option, and an explicit auto-approve toggle that maps to Grok Build’s documented `--yolo` flag.
- **LM Studio first-class** — visible local-endpoint mode and provider configuration. It does not launch or shotgun-load models; model loading remains under the local LM Studio server’s control.
- **Telegram bot connection** — validates a BotFather token with `getMe`, stores it only with Electron `safeStorage`, and supports sending through Telegram’s Bot API. Inbound routing stays off until a chat allowlist is added.
- **No subscription UI** — there is no “Plus Plan,” upsell, or fake entitlement surface.

## Design sources actually used

| Project | What was taken | License / status |
| --- | --- | --- |
| [xai-org/grok-build](https://github.com/xai-org/grok-build) | Core execution backend, headless event stream, sessions, permissions, skills/MCP path | Apache-2.0 |
| [anomalyco/opencode](https://github.com/anomalyco/opencode) | Desktop shell boundaries and provider/workspace UX ideas | MIT; desktop app is beta |
| [MiniMax-AI/OpenRoom](https://github.com/MiniMax-AI/OpenRoom) | Local-first app/action framing and desktop-like organization | MIT |
| [openclaw/openclaw](https://github.com/openclaw/openclaw) | Gateway/channel model; Telegram is treated as an explicit integration, not a UI mock | source available; see upstream license |
| [Oct1AtJoe/zcode-desktop](https://github.com/Oct1AtJoe/zcode-desktop) | Local task/usage visibility as an optional desktop surface | MIT; community project |

The app borrows interaction ideas, not branding or proprietary assets. `zcode-desktop` is a community monitoring app, not the official ZCode client source.

## Quick start

```bash
git clone https://github.com/Franzferdinan51/Grok-Build-Desktop-App.git
cd Grok-Build-Desktop-App
pnpm install

# Install Grok Build using the official upstream instructions, then authenticate.
curl -fsSL https://x.ai/cli/install.sh | bash

pnpm dev
```

Set `GROK_BUILD_PATH` if `grok` is not on `PATH`.

## Grok Build execution model

This app does **not** invent an undocumented JSON-RPC protocol. It launches the documented command form below for each task:

```bash
grok -p "<task>" --cwd "<workspace>" --output-format streaming-json
```

When selected, it adds only documented flags: `--model`, `--reasoning-effort high`, and `--yolo` (after the user enables auto-approve). See the upstream [headless-mode guide](https://github.com/xai-org/grok-build/blob/main/crates/codegen/xai-grok-pager/docs/user-guide/14-headless-mode.md).

## Docs

- [Architecture](docs/ARCHITECTURE.md)
- [Providers and local model policy](docs/PROVIDERS.md)
- [Feature-source matrix](docs/FEATURES-INSPO.md)
- [Telegram integration](docs/TELEGRAM.md)
- [Install and build](docs/INSTALL.md)

## Status

Foundation implementation. Run `pnpm build` before release packaging; see the GitHub Actions/CI follow-up work in the docs.

## License

MIT. Grok Build is a separate upstream project under Apache-2.0.
