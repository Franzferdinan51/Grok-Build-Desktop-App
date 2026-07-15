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
pnpm typecheck
pnpm build
```

## LM Studio

Start its server separately and configure the endpoint in the app. This project does not load or unload LM Studio models automatically.

## Telegram

Create a bot with BotFather, then paste the token only into the app’s Telegram connection screen. The desktop app validates the token with `getMe` before saving it through Electron `safeStorage`.
