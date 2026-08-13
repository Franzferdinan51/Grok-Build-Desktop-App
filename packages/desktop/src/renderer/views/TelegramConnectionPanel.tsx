import { For, Show } from "solid-js"
import type { TelegramChat, TelegramStatus } from "../../preload"

function phaseLabel(status: TelegramStatus): string {
  const coolOff = status.coolOffMs || 0
  const phase = coolOff > 0
    ? "cooling"
    : !status.hasToken ? "setup"
    : status.error && !status.connected ? "error"
    : status.connected && status.polling ? "live"
    : status.connected ? "ready"
    : "saved"
  if (phase === "live") return "Polling live"
  if (phase === "ready") return "Token verified"
  if (phase === "saved") return "Token saved · not polling"
  if (phase === "cooling") return `Cooling off ${Math.ceil((status.coolOffMs || 0) / 1000)}s`
  if (phase === "error") return "Connection error"
  return "Not connected"
}

function formatSeen(at?: number): string {
  if (!at) return "Never seen"
  return new Date(at).toLocaleString()
}

export function TelegramConnectionPanel(props: {
  status: TelegramStatus
  allowed: TelegramChat[]
  pending: TelegramChat[]
  token: string
  notice: string
  onToken: (value: string) => void
  onConnect: () => void
  onReconnect: () => void
  onDisconnect: () => void
  onForget: () => void
  onApprove: (id: string) => void
  onDeny: (id: string) => void
  onRevoke: (id: string) => void
  onAutoApproveFirst: (enabled: boolean) => void
  onAgentOptions: (patch: { requireMention?: boolean; reactions?: boolean; notifications?: "important" | "all"; statusIndicator?: boolean }) => void
  onOpenBot: () => void
  onOpenBotFather: () => void
  onRefresh: () => void
  onCopy: (value: string) => void
}) {
  const live = () => props.status.connected && props.status.polling
  const hasToken = () => Boolean(props.status.hasToken)

  return <div class="telegram-connect">
    <div class="telegram-connect__steps">
      <span class={hasToken() ? "is-done" : "is-current"}>1. Bot token</span>
      <span class={live() ? "is-done" : hasToken() ? "is-current" : ""}>2. Polling</span>
      <span class={props.allowed.length ? "is-done" : live() ? "is-current" : ""}>3. Approve a chat</span>
    </div>

    <article class={`runtime-banner ${live() && !props.status.lastError ? "runtime-banner--ready" : (props.status.error || props.status.lastError) ? "runtime-banner--error" : ""}`}>
      {phaseLabel(props.status)}
      {props.status.username ? ` · @${props.status.username}` : ""}
      {props.status.firstName ? ` · ${props.status.firstName}` : ""}
      <Show when={props.status.lastError && live()}><span> · {props.status.lastError}</span></Show>
    </article>

    <Show when={!hasToken()}>
      <section class="detail-column telegram-connect__setup">
        <header>
          <span class="eyebrow">CONNECT BOT</span>
          <h2>Pair a dedicated BotFather bot</h2>
          <p>Create a bot with BotFather, then paste the token here. It is verified with getMe and stored only through OS credential encryption. The renderer forgets it after submit.</p>
        </header>
        <div class="detail-actions" style={{ "margin-bottom": "14px" }}>
          <button onClick={() => props.onOpenBotFather()}>Open BotFather</button>
        </div>
        <div class="form-stack">
          <label>Bot token
            <input type="password" value={props.token} onInput={(event) => props.onToken(event.currentTarget.value)} placeholder="123456:ABC…" autocomplete="off" />
          </label>
        </div>
        <div class="detail-actions">
          <button class="primary" disabled={!props.token.trim()} onClick={() => props.onConnect()}>Connect bot</button>
        </div>
      </section>
    </Show>

    <Show when={hasToken()}>
      <div class="detail-actions telegram-connect__actions">
        <Show when={!props.status.polling}>
          <button class="primary" disabled={(props.status.coolOffMs || 0) > 0} onClick={() => props.onReconnect()}>Reconnect</button>
        </Show>
        <Show when={props.status.username}>
          <button onClick={() => props.onOpenBot()}>Open @{props.status.username}</button>
          <button onClick={() => props.onCopy(`https://t.me/${props.status.username}`)}>Copy bot link</button>
        </Show>
        <button onClick={() => props.onRefresh()}>Refresh</button>
        <button onClick={() => props.onDisconnect()}>Pause polling</button>
        <button onClick={() => props.onForget()}>Remove token</button>
      </div>
      <Show when={!props.status.polling && hasToken()}>
        <p class="page-lede">The encrypted token is still on disk. Reconnect starts long polling again without pasting the secret.</p>
      </Show>
    </Show>

    <label class="settings-switch telegram-connect__switch">
      <input type="checkbox" checked={Boolean(props.status.autoApproveFirst)} onChange={(event) => props.onAutoApproveFirst(event.currentTarget.checked)} />
      <span />
      Auto-approve the first incoming chat
    </label>
    <p class="provider-notice">Off by default. Useful for a personal bot. Later chats still need explicit approval.</p>

    <h3 class="list-group__label">Agent channel</h3>
    <p class="provider-notice">Hermes/OpenClaw-style channel controls. Grok Build stays the only execution runtime.</p>
    <label class="settings-switch telegram-connect__switch">
      <input type="checkbox" checked={Boolean(props.status.requireMention)} onChange={(event) => props.onAgentOptions({ requireMention: event.currentTarget.checked })} />
      <span />
      Groups require @mention or reply
    </label>
    <label class="settings-switch telegram-connect__switch">
      <input type="checkbox" checked={props.status.reactions !== false} onChange={(event) => props.onAgentOptions({ reactions: event.currentTarget.checked })} />
      <span />
      React 👀 / ✅ / ❌ while a task runs
    </label>
    <label class="settings-switch telegram-connect__switch">
      <input type="checkbox" checked={props.status.notifications !== "all"} onChange={(event) => props.onAgentOptions({ notifications: event.currentTarget.checked ? "important" : "all" })} />
      <span />
      Quiet progress (notify only finals and approvals)
    </label>
    <label class="settings-switch telegram-connect__switch">
      <input type="checkbox" checked={props.status.statusIndicator !== false} onChange={(event) => props.onAgentOptions({ statusIndicator: event.currentTarget.checked })} />
      <span />
      Show Online / Offline on the bot profile
    </label>
    <p class="provider-notice">Use /sethome in Telegram to deliver scheduled results to that chat{props.status.homeChatId ? ` · home ${props.status.homeChatId}` : ""}.</p>

    <section class="telegram-connect__pairing">
      <h3 class="list-group__label">Pairing requests</h3>
      <Show when={props.pending.length} fallback={
        <div class="telegram-connect__empty-pairing">
          <p class="tree-pane__hint">No requests yet. Connect the bot, open its Telegram chat, and send <code>/start</code> or any message.</p>
          <button onClick={() => props.onRefresh()}>Check for requests</button>
        </div>
      }>
        <For each={props.pending}>{(chat) =>
          <article class="list-row list-row--static">
            <div>
              <strong>{chat.label}</strong>
              <span>{chat.id}{chat.type ? ` · ${chat.type}` : ""} · {formatSeen(chat.lastSeenAt)}{chat.lastPreview ? ` · ${chat.lastPreview}` : ""}</span>
            </div>
            <div class="detail-actions">
              <button class="primary" onClick={() => props.onApprove(chat.id)}>Approve</button>
              <button onClick={() => props.onDeny(chat.id)}>Deny</button>
              <button onClick={() => props.onCopy(chat.id)}>Copy id</button>
            </div>
          </article>
        }</For>
      </Show>
    </section>

    <section>
      <h3 class="list-group__label">Authorized chats</h3>
      <Show when={props.allowed.length} fallback={<p class="tree-pane__hint">No chats are authorized yet. Message the bot, then approve the pairing request.</p>}>
        <For each={props.allowed}>{(chat) =>
          <article class="list-row list-row--static">
            <div>
              <strong>{chat.label}</strong>
              <span>{chat.id}{chat.type ? ` · ${chat.type}` : ""} · {formatSeen(chat.lastSeenAt)}{chat.lastPreview ? ` · ${chat.lastPreview}` : ""}</span>
            </div>
            <div class="detail-actions">
              <button onClick={() => props.onCopy(chat.id)}>Copy id</button>
              <button onClick={() => props.onRevoke(chat.id)}>Revoke</button>
            </div>
          </article>
        }</For>
      </Show>
    </section>

    <dl class="detail-meta telegram-connect__diag">
      <div><dt>Polling</dt><dd>{props.status.polling ? "Live long poll" : "Paused"}</dd></div>
      <div><dt>Webhook</dt><dd>{props.status.webhookCleared ? "Cleared for local polling" : "Unknown"}</dd></div>
      <div><dt>Command menu</dt><dd>{props.status.commandMenuOk ? "Registered" : "Not registered"}</dd></div>
      <div><dt>Last poll</dt><dd>{formatSeen(props.status.lastPollAt)}</dd></div>
      <div><dt>Last error</dt><dd>{props.status.lastError || props.status.error || "None"}</dd></div>
      <div><dt>Bot id</dt><dd>{props.status.botId || "—"}</dd></div>
    </dl>

    <Show when={props.notice}><p class={props.status.connected ? "notice" : "notice notice--error"}>{props.notice}</p></Show>
    <p class="telegram-note">Do not reuse a bot token that another polling process is consuming. Unknown chats cannot run tasks until you approve them here.</p>
  </div>
}
