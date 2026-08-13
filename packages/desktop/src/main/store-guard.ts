/** Renderer store IPC must never read or write Telegram token material. */
export function isRendererForbiddenStoreKey(key: string): boolean {
  const value = String(key || "").trim().toLowerCase()
  return value === "telegram" || value.startsWith("telegram.")
}
