# Native / Electron parity

Grok Build Desktop ships two maintained implementations without removing either:

| Capability | macOS native (OpenClaw base) | Electron (Hermes base) | Backend rule |
| --- | --- | --- | --- |
| Coding workspace and task composer | `GrokBuildCodingView` | Grok Build composer | Grok Build headless CLI only |
| Task stream and stop | Native streaming output | IPC streaming output | `streaming-json`; no fake RPC |
| Grok run history | persistent native run history with CLI session ids | persistent run history with CLI session ids | every persisted coding task originates from Grok Build |
| Projects / Git review | OpenClaw desktop shell + migration work | persistent projects, branch/change count, diff stat | local filesystem/Git only |
| Skills | OpenClaw native skills interface | functional project/user skill discovery | project skills take precedence |
| Scheduled coding tasks | OpenClaw scheduler; Grok-specific execution wiring pending | functional persisted one-shot/repeating Grok tasks while app runs | Grok Build CLI only; no hidden daemon claim |
| Provider credentials | Keychain-backed LM Studio/ODS/MiniMax settings | OS-safeStorage-backed LM Studio/ODS/MiniMax settings | injected only into Grok CLI environment |
| Approvals and channels | OpenClaw native information architecture | Hermes-derived explicit controls | must remain explicit and user-controlled |
| Telegram | OpenClaw channel foundation | encrypted Bot API bridge; allowlist pending | no implicit inbound routing |
| Grok Build model catalog (LM Studio + APIs) | reads `grok models`; selected id reaches `grok --model` | reads `grok models`; selected id reaches `grok --model` | no second provider/agent path; never auto-load models |
| Local Studio monitor | optional read-only `/health`, `/status`, `/gpus` monitor | optional read-only `/health`, `/status`, `/gpus` monitor | no lifecycle routes are called |
| Windows / Linux distribution | not applicable | Electron packaging target | feature parity target |

## Electron source base

`upstream/hermes/apps/desktop` is the preserved MIT Hermes Desktop source base.
Its backend-resolution discipline is adapted in
`packages/desktop/src/main/grok-build-resolver.ts`: candidates are probed before
use, but the sole accepted agent runtime is Grok Build. The existing Electron
app will be migrated in slices rather than replacing the working native app.

## Parity acceptance rule

A feature is considered cross-platform only when it is implemented in both
desktop targets or is deliberately platform-specific with an equivalent user
path documented here. A mock card or an inactive navigation item does not count.

## Coding-first rule

Grok Build is not a selectable provider in either application: it is the
execution engine for every actionable coding task. The desktop layers own only
the secure UI, project state, local Git inspection, and explicit integrations.
LM Studio is kept as a local endpoint for the user's models and is never allowed
to silently load, swap, or duplicate models. Telegram is an explicit channel,
not an alternate agent backend.
