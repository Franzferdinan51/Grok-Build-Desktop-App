# Grok Build Desktop

Local-first desktop workbench for **Grok Build**. The canonical UI base is the MIT-licensed OpenClaw macOS desktop application; Grok Build is the coding-agent backend.

There are two maintained desktop targets: the native macOS app based on OpenClaw, and a cross-platform Electron app based on Hermes Desktop. Both keep their upstream MIT license/notices, use Grok Build as the only coding backend, and follow one feature-parity contract.

## What is implemented

- **Native OpenClaw desktop base** — dashboard, channel, skill, schedule, approval, gateway, and settings information architecture comes from the actual MIT OpenClaw macOS application, not a look-alike.
- **Cross-platform Hermes Electron base** — the full MIT Hermes Desktop source is vendored under `upstream/hermes`; its hardened Electron, project, review, preview, and packaging patterns drive the Windows/Linux-compatible implementation.
- **Grok Build backend** — every actionable coding task in both targets runs the documented headless interface: `grok -p … --output-format streaming-json`. Both native and Electron persist local run history and record the resulting Grok CLI session when supplied. No undocumented JSON-RPC or replacement agent backend is invented.
- **Grok-first coding flow** — workspace picker, prompt composer, stream output, reasoning-effort option, and an explicit auto-approve toggle that maps to Grok Build’s documented `--yolo` flag.
- **LM Studio first-class** — LM Studio and API models live in Grok Build's own model catalog. The native and Electron model pickers read `grok models` and pass the selected id to Grok Build; neither app creates a second agent/provider path or auto-loads models.
- **ODS + MiniMax first-class** — configure either as a Grok Build custom model and it appears beside LM Studio in both model pickers. Grok Build remains the sole execution backend; see [provider setup](docs/PROVIDERS.md).
- **Secure, editable provider settings** — Electron stores LM Studio, ODS, MiniMax, and generic OpenAI-compatible credentials with OS `safeStorage`; macOS native uses Keychain. Base URLs and model IDs are editable and written into a clearly marked managed section of Grok Build's model catalog. Secrets are injected only into the Grok CLI child process and are never returned to the renderer.
- **Skills browser** — Electron discovers project and user `SKILL.md` files from Grok and compatible agent directories, with project skills taking precedence. Native retains OpenClaw's full skills interface.
- **Scheduled coding tasks** — Electron persists one-shot or repeating tasks and executes them through the same Grok Build backend while the app is running. Native retains OpenClaw's scheduler while Grok-specific native scheduling is completed.
- **Local Studio monitor** — optional read-only controller integration in both desktop targets for `/health`, `/status`, and `/gpus`. It never invokes model lifecycle routes.
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
| [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) | **Cross-platform Electron source base**: hardened desktop shell, project/worktree/session, review/preview, connection/settings, packaging | MIT; vendored under `upstream/hermes` with license retained |
| [Z.ai ZCode](https://zcode.z.ai/en) | Product/UX reference only | Closed source; no code copied |

The app borrows interaction ideas, not branding or proprietary assets. Z.ai ZCode is a product reference only; no Z.ai source code or proprietary assets are included.

## Native macOS source base

The import is pinned in [upstream/openclaw/UPSTREAM.md](upstream/openclaw/UPSTREAM.md). The first migration slice adds **Grok Build Coding** to the native app: workspace picker, task composer, explicit high-reasoning and auto-approve controls, streamed task output, and no automatic LM Studio model loads.

Build requirements for this target come from its upstream Swift package (macOS 15, Swift 6.2, plus the declared Swift package dependencies):

```bash
cd upstream/openclaw/apps/macos
swift build --target OpenClaw
```

## Electron desktop target

The Electron app in `packages/desktop` is the cross-platform target. It now uses
the Hermes-style candidate/probe discipline before accepting a Grok Build
runtime; it never boots Hermes Agent. The preserved source base and attribution
are in [upstream/hermes/UPSTREAM.md](upstream/hermes/UPSTREAM.md).

See [native/Electron feature parity](docs/PLATFORM-PARITY.md) for the shared
acceptance contract.

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

Both targets are active. Native migration starts from OpenClaw; Electron migration starts from Hermes Desktop. Electron now has functional Grok skills discovery, Grok-backed schedules, and encrypted provider settings. Native has Grok model selection and Keychain-backed provider settings; Grok-specific native schedule wiring remains an explicit parity item. Neither target replaces Grok Build with another coding agent.

## License

MIT. The vendored OpenClaw source retains its original MIT license and third-party notices. Grok Build is a separate upstream project under Apache-2.0.
