/**
 * Pure transformations for the persisted Telegram bridge state. Kept in a
 * separate file (no electron / electron-store imports) so the smoke harness
 * can drive the exact shipped code without bootstrapping the desktop
 * runtime.
 */

export type TelegramPersistedState = {
  token?: string
  updateOffset?: number
  allowedChatIds?: string[]
  pendingChatIds?: string[]
  sessions?: Record<string, unknown>
}

/**
 * Build the next persisted-state object for a "soft" disconnect: stop
 * polling, keep the encrypted token so the user can reconnect without
 * re-entering it, preserve allowlist + pending chats + per-chat sessions
 * and reset the offset so the next connect starts fresh.
 */
export function withDisconnectedState(previous: TelegramPersistedState): TelegramPersistedState {
  return {
    ...previous,
    allowedChatIds: previous.allowedChatIds || [],
    pendingChatIds: previous.pendingChatIds || [],
    updateOffset: 0,
    sessions: previous.sessions || {},
  }
}

/**
 * Build the next persisted-state object for a "hard" forget: same as
 * the soft disconnect but the encrypted bot token is dropped from disk.
 * Previously `disconnect()` did NOT clear the token, so clicking
 * "Disconnect" left the encrypted token on disk — a privacy defect
 * given the rest of the file's encryption posture and the user's
 * expectation when they ask to remove the bot.
 */
export function withForgottenTokenState(previous: TelegramPersistedState): TelegramPersistedState {
  const { token: _dropped, ...rest } = previous
  void _dropped
  return {
    ...rest,
    allowedChatIds: previous.allowedChatIds || [],
    pendingChatIds: previous.pendingChatIds || [],
    updateOffset: 0,
    sessions: previous.sessions || {},
  }
}
