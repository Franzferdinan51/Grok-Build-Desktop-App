# Contributing

## Non-negotiable rules

- Keep Grok Build as the execution backend.
- Add only Grok Build options that are verified in upstream documentation.
- Do not surface a provider as runnable before its backend path is implemented.
- Do not auto-load LM Studio models.
- Keep Telegram tokens out of renderer state after submission and preserve explicit user control over sends and inbound routing.

## Before a pull request

```bash
pnpm typecheck
pnpm build
```

Update `README.md`, `ARCHITECTURE.md`, and `FEATURES-INSPO.md` when behavior or upstream-source choices change.
