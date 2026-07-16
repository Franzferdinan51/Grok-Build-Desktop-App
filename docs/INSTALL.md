# Install and build

## Prerequisites

- Node.js 20+
- pnpm 9+
- Grok Build installed from [xAI’s official instructions](https://github.com/xai-org/grok-build#installing-the-released-binary)

## Development

```bash
git clone https://github.com/Franzferdinan51/Grok-Build-Desktop-App.git
cd Grok-Build-Desktop-App
pnpm install
grok --version
pnpm dev
```

If the executable is not on `PATH`, set `GROK_BUILD_PATH` to the installed `grok` executable before launching the app.

## Production validation

```bash
pnpm test:smoke
pnpm typecheck
pnpm build
pnpm package
```

`test:smoke` validates the installed Grok CLI/model catalog, streamed reasoning parser, project file policies, traversal blocking, symlink exclusion, terminal working directory, and Git status/diff behavior in a temporary workspace.

Packaged output is written to `packages/desktop/dist`. On macOS, closing the last window keeps the application available in the Dock; activating it recreates and reloads the Grok Build window.

## LM Studio

Start its server separately and configure the endpoint in the app. This project does not load or unload LM Studio models automatically.

## Telegram

Create a bot with BotFather, then paste the token only into the app’s Telegram connection screen. The desktop app validates the token with `getMe` before saving it through Electron `safeStorage`.
