# Telegram integration

## Current capability

The desktop app can connect a Telegram bot created with BotFather:

1. Paste the bot token into the Telegram screen.
2. The main process calls `getMe` to validate it.
3. On success, the token is encrypted with Electron `safeStorage` and stored in the app’s local settings.
4. The main process can send a message through `sendMessage` when a user explicitly invokes that action.

The renderer gets only connection status, bot ID, and username — never the token.

## Intentional boundary

Inbound polling/webhooks and automatic task execution are **not enabled** in this foundation. They require a chat/user allowlist, rate limits, and an approval policy. Connecting a bot must not silently make a coding agent available to every person who can message it.

## Future bridge option

OpenClaw already supports Telegram as a channel and acts as a gateway/control plane. A later integration can route an allowlisted OpenClaw conversation to this app, but it must preserve OpenClaw’s routing and approval boundaries rather than duplicate Telegram credentials.
