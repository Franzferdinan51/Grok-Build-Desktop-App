import { For, Show } from "solid-js"

export type DesktopNotification = { id: number; kind: "info" | "success" | "error"; title: string; message: string }

export function NotificationStack(props: { notifications: DesktopNotification[]; onDismiss: (id: number) => void }) {
  return <Show when={props.notifications.length}><div class="desktop-notifications" role="region" aria-label="Notifications"><For each={props.notifications}>{(notice) => <article class={`desktop-notification desktop-notification--${notice.kind}`} role={notice.kind === "error" ? "alert" : "status"}><span class="desktop-notification__icon">{notice.kind === "success" ? "✓" : notice.kind === "error" ? "!" : "i"}</span><div><strong>{notice.title}</strong><p>{notice.message}</p></div><button onClick={() => props.onDismiss(notice.id)} aria-label="Dismiss notification">×</button></article>}</For></div></Show>
}

