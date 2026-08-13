export const DEFAULT_QUICK_ENTRY_ACCELERATOR = "CommandOrControl+Shift+Space"
export type QuickEntryTarget = "current" | "new"
export function normalizeQuickEntryAccelerator(value: string): string { return value.trim().replace(/\s+/g, "").replace(/commandorcontrol/gi, "CommandOrControl").replace(/ctrl/gi, "Control").replace(/cmd/gi, "Command") }
export function validateQuickEntryAccelerator(value: string): string {
  const normalized = normalizeQuickEntryAccelerator(value)
  if (!normalized || !normalized.includes("+")) throw new Error("Quick Entry shortcut must include a modifier")
  if (!/(CommandOrControl|Command|Control|Alt|Option|Super|Meta)/i.test(normalized)) throw new Error("Quick Entry shortcut must include a supported modifier")
  if (!/(Space|[A-Z0-9])$/i.test(normalized)) throw new Error("Quick Entry shortcut must end with a letter, number, or Space")
  return normalized
}
export function isQuickEntryTarget(value: unknown): value is QuickEntryTarget { return value === "current" || value === "new" }
