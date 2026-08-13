export type DesktopNotificationKind = "success" | "error"
export type DesktopNotificationInput = { kind: DesktopNotificationKind; title: string; body: string }

const MAX_TITLE = 120
const MAX_BODY = 600

export function normalizeDesktopNotification(input: Partial<DesktopNotificationInput>): DesktopNotificationInput | null {
  if (input.kind !== "success" && input.kind !== "error") return null
  const title = typeof input.title === "string" ? input.title.trim().slice(0, MAX_TITLE) : ""
  const body = typeof input.body === "string" ? input.body.trim().slice(0, MAX_BODY) : ""
  if (!title || !body) return null
  return { kind: input.kind, title, body }
}

