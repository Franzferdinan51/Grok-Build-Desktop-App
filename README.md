# Grok Build Desktop

Local-first desktop workbench for **Grok Build**. The canonical UI base is the MIT-licensed OpenClaw macOS desktop application; Grok Build is the coding-agent backend.

The previous Electron/Solid proof of concept remains in `packages/` as a transition reference. New desktop work belongs in `upstream/openclaw/apps/macos`, deliberately vendored from OpenClaw with its license and notices retained.

## What is implemented

- **Native OpenClaw desktop base** — dashboard, channel, skill, schedule, approval, gateway, and settings information architecture comes from the actual MIT OpenClaw macOS application, not a look-alike.
- **Grok Build backend** — the native coding window runs the documented headless interface: `grok -p … --output-format streaming-json`. No undocumented JSON-RPC or replacement agent backend is invented.
- **Grok-first coding flow** — workspace picker, prompt composer, stream output, reasoning-effort option, and an explicit auto-approve toggle that maps to Grok Build’s documented `--yolo` flag.
- **LM Studio first-class** — visible local-endpoint mode and provider configuration. It does not launch or shotgun-load models; model loading remains under the local LM Studio server’s control.
- **Telegram bot connection** — validates a BotFather token with `getMe`, stores it only with Electron `safeStorage`, and supports sending through Telegram’s Bot API. Inbound routing stays off until a chat allowlist is added.
- **Coding cockpit projects** — persistent project rail, Git branch/change state, and a read-only review pane; this replaces the disposable folder-picker design.
- **No subscription UI** — there is no “Plus Plan,” upsell, or fake entitlement surface.

## Design sources actually used

| Project | What was taken | License / status |
| --- | --- | --- |
| [xai-org/grok-build](https://github.com/xai-org/grok-build) | Core execution backend, headless event stream, sessions, permissions, skills/MCP path | Apache-2.0 |
| [anomalyco/opencode](https://github.com/anomalyco/opencode) | Desktop shell boundaries and provider/workspace UX ideas | MIT; desktop app is beta |
| [MiniMax-AI/OpenRoom](https://github.com/MiniMax-AI/OpenRoom) | Local-first app/action framing and desktop-like organization | MIT |
| [openclaw/openclaw](https://github.com/openclaw/openclaw) | **Canonical macOS desktop source base**: dashboard, channels, settings, skills, schedules, approvals, gateway health | MIT; vendored under `upstream/openclaw` with notices retained |
| [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) | Project/worktree/session, coding rail, review pane, connection/settings patterns | MIT; patterns only, no source copied yet |
| [Z.ai ZCode](https://zcode.z.ai/en) | Product/UX reference only | Closed source; no code copied |

The app borrows interaction ideas, not branding or proprietary assets. Z.ai ZCode is a product reference only; no Z.ai source code or proprietary assets are included.

## Native macOS source base

The import is pinned in [upstream/openclaw/UPSTREAM.md](upstream/openclaw/UPSTREAM.md). The first migration slice adds **Grok Build Coding** to the native app: workspace picker, task composer, explicit high-reasoning and auto-approve controls, streamed task output, and no automatic LM Studio model loads.

Build requirements for this target come from its upstream Swift package (macOS 15, Swift 6.2, plus the declared Swift package dependencies):

```bash
cd upstream/openclaw/apps/macos
swift build --target OpenClaw
```

## Electron transition prototype

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

Neither desktop implementation invents an undocumented JSON-RPC protocol. The native coding window launches the documented command form below for each task:

```bash
grok -p "<task>" --cwd "<workspace>" --output-format streaming-json
```

When selected, it adds only documented flags: `--model`, `--reasoning-effort high`, and `--yolo` (after the user enables auto-approve). See the upstream [headless-mode guide](https://github.com/xai-org/grok-build/blob/main/crates/codegen/xai-grok-pager/docs/user-guide/14-headless-mode.md).

## Docs

- [Architecture](docs/ARCHITECTURE.md)
- [Providers and local model policy](docs/PROVIDERS.md)
- [Feature-source matrix](docs/FEATURES-INSPO.md)
- [Telegram integration](docs/TELEGRAM.md)
- [OpenClaw/Hermes/ZCode rebase](docs/UPSTREAM-REBASE.md)
- [Install and build](docs/INSTALL.md)

## Status

Native migration is underway. The actual OpenClaw macOS source is now the canonical base; not every OpenClaw pathway has been replaced by Grok Build yet. Run the Swift target above for native validation and `pnpm build` only for the retained Electron transition prototype.

## License

MIT. The vendored OpenClaw source retains its original MIT license and third-party notices. Grok Build is a separate upstream project under Apache-2.0.
