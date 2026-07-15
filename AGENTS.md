# AGENTS.md

## Product contract

- Grok Build is the coding-agent backend. Do not add another agent runtime in Electron.
- Call only verified Grok Build command flags. The current transport is `grok -p … --output-format streaming-json`.
- LM Studio is first-class but local-model loading is user-controlled. Check loaded state before any future load command.
- Telegram tokens never enter renderer state after submission and must use Electron `safeStorage`.
- No subscriptions, upsells, or “Plus Plan” surface.

## Layout

| Path | Purpose |
| --- | --- |
| `packages/desktop/src/main/grok-build-backend.ts` | Grok Build task runner and event parser |
| `packages/desktop/src/main/telegram.ts` | Encrypted Telegram Bot API bridge |
| `packages/desktop/src/main/ipc.ts` | Narrow renderer-to-main boundary |
| `packages/desktop/src/renderer/App.tsx` | Desktop workbench UI |
| `docs/` | Source audit, architecture, local-provider policy, Telegram boundary |

## Validation

```bash
pnpm typecheck
pnpm build
```

Do not claim a provider, protocol, UI control, or integration works until it is implemented and validated.
