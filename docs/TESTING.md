# Testing and release checks

## Automated release gate

Run from the repository root:

```bash
pnpm test:smoke
pnpm typecheck
pnpm build
pnpm package
```

The smoke suite covers:

- Grok Build CLI discovery and model catalog.
- Streamed token merging and collapsed `<think>` extraction.
- Workspace listing, reading, and writing.
- Ignored dependency/build directories and symlink exclusion.
- Parent-directory traversal rejection.
- Project terminal working-directory containment.
- Git change discovery and per-file diff generation.

## Release smoke

After packaging, launch the generated application and verify:

1. The window reaches `ready-to-show` with no renderer error in the application log.
2. Scratch is created automatically when no project exists.
3. A minimal Grok prompt streams `thought`, `text`, and `end` events and records its session ID.
4. Closing and reactivating the macOS app reloads the window.
5. The production artifact uses context isolation, renderer sandboxing, and no Node integration.

## Credentialed integrations

LM Studio, ODS, MiniMax, custom OpenAI-compatible endpoints, Local Studio, and Telegram depend on operator-owned services or credentials. Their settings expose explicit connection tests. Release automation must not send Telegram messages, load/unload local models, or call paid provider inference without opt-in.
