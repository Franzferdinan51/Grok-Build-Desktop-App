export type SessionRailMode = "files" | "terminal" | "activity" | "preview" | "review"

export function nextSessionRail(current: SessionRailMode | null, requested: SessionRailMode, available = true): SessionRailMode | null {
  if (!available) return current
  return current === requested ? null : requested
}
