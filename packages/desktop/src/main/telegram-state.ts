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
  chatProfiles?: Record<string, unknown>
  autoApproveFirst?: boolean
  sessions?: Record<string, unknown>
}

function withSharedDisconnectFields(previous: TelegramPersistedState): Omit<TelegramPersistedState, "token"> {
  return {
    allowedChatIds: previous.allowedChatIds || [],
    pendingChatIds: previous.pendingChatIds || [],
    chatProfiles: previous.chatProfiles || {},
    autoApproveFirst: previous.autoApproveFirst || false,
    updateOffset: 0,
    sessions: previous.sessions || {},
  }
}

/**
 * Soft disconnect: stop polling, keep the encrypted token so the user can
 * reconnect without re-entering the BotFather secret, preserve allowlist,
 * pending chats, chat identity, and per-chat sessions.
 */
export function withDisconnectedState(previous: TelegramPersistedState): TelegramPersistedState {
  return {
    ...previous,
    ...withSharedDisconnectFields(previous),
  }
}

/**
 * Hard forget: same as the soft disconnect but the encrypted bot token is
 * dropped from disk.
 */
export function withForgottenTokenState(previous: TelegramPersistedState): TelegramPersistedState {
  const { token: _dropped, ...rest } = previous
  void _dropped
  return {
    ...rest,
    ...withSharedDisconnectFields(previous),
  }
}
