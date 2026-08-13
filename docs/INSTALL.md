# Install and build

## Prerequisites

- Node.js 20.19+ (or 22.12+; Node 22.22+ is recommended for the desktop toolchain)
- pnpm 9+
- Grok Build installed from [xAI’s official instructions](https://github.com/xai-org/grok-build#installing-the-released-binary)
- [DuckBot RAG Memory](https://github.com/Franzferdinan51/duckbot-rag-memory) installed locally with its `.venv`; the desktop auto-detects `~/.openclaw/workspace/duckbot-rag-memory` first, then the other supported local locations.

## Development

```bash
git clone https://github.com/Franzferdinan51/Grok-Build-Desktop-App.git
cd Grok-Build-Desktop-App
pnpm install
grok --version
pnpm dev
```

Verify the primary memory bridge before relying on semantic recall:

```bash
test -x ~/.openclaw/workspace/duckbot-rag-memory/.venv/bin/python
test -f ~/.openclaw/workspace/duckbot-rag-memory/src/extensions/duckbot_brain/adapter.py
```

If the executable is not on `PATH`, set `GROK_BUILD_PATH` to the installed `grok` executable before launching the app.

## Production validation

```bash
pnpm test:smoke
pnpm typecheck
pnpm build
pnpm package
```

The desktop build uses Electron-Vite 5 and Vite 7. If a shell selects an older
Node runtime from another tool installation, check `node --version` before
building; the supported minimum is Node 20.19 (or Node 22.12+).

`test:smoke` validates the installed Grok CLI/model catalog, streamed reasoning parser, project file policies, traversal blocking, symlink exclusion, terminal working directory, and Git status/diff behavior in a temporary workspace.

Packaged output is written to `packages/desktop/dist`. On macOS, closing the last window keeps the application available in the Dock; activating it recreates and reloads the Grok Build window.

## LM Studio

Start its server separately and configure the endpoint in the app. This project does not load or unload LM Studio models automatically.

## Telegram

Create a bot with BotFather, then paste the token only into the app’s Telegram connection screen. The desktop app validates the token with `getMe` before saving it through Electron `safeStorage`.
