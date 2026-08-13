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
  homeChatId?: string
  requireMention?: boolean
  reactions?: boolean
  notifications?: "important" | "all"
  statusIndicator?: boolean
  sessions?: Record<string, unknown>
}

function withSharedDisconnectFields(previous: TelegramPersistedState): Omit<TelegramPersistedState, "token"> {
  return {
    allowedChatIds: previous.allowedChatIds || [],
    pendingChatIds: previous.pendingChatIds || [],
    chatProfiles: previous.chatProfiles || {},
    autoApproveFirst: previous.autoApproveFirst || false,
    ...(previous.homeChatId ? { homeChatId: previous.homeChatId } : {}),
    ...(previous.requireMention ? { requireMention: true } : {}),
    ...(previous.reactions === false ? { reactions: false } : {}),
    ...(previous.notifications === "all" ? { notifications: "all" as const } : {}),
    ...(previous.statusIndicator === false ? { statusIndicator: false } : {}),
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

/** Renderer-facing status must never carry the BotFather secret. */
export function telegramStatusForRenderer<T extends Record<string, unknown>>(status: T): Omit<T, "token"> {
  const { token: _dropped, ...rest } = status as T & { token?: unknown }
  void _dropped
  return rest
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
