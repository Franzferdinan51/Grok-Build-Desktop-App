export const MAX_DOCKED_SESSIONS = 4

export function parseDockedSessionIds(value: unknown): string[] {
  const values = Array.isArray(value) ? value : typeof value === "string" ? [value] : []
  return values.filter((id): id is string => typeof id === "string" && Boolean(id.trim())).slice(0, MAX_DOCKED_SESSIONS)
}

export function addDockedSessionId(ids: string[], id: string): string[] {
  if (!id.trim()) return ids
  return [id, ...ids.filter((entry) => entry !== id)].slice(0, MAX_DOCKED_SESSIONS)
}

export function removeDockedSessionId(ids: string[], id: string): string[] {
  return ids.filter((entry) => entry !== id)
}
