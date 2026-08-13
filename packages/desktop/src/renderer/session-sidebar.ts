import type { StoredChatSummary } from "../preload"

export const DEFAULT_SESSION_SIDEBAR_LIMIT = 12

/** Keep the sidebar bounded; full transcripts load only after selection. */
export function sessionSidebarEntries(
  summaries: StoredChatSummary[],
  query = "",
  limit = DEFAULT_SESSION_SIDEBAR_LIMIT,
): StoredChatSummary[] {
  const needle = query.trim().toLocaleLowerCase()
  return summaries
    .filter((summary) => summary.messageCount > 0 && !summary.archived)
    .filter((summary) => !needle || [summary.title, summary.workspace, summary.model || ""].some((value) => value.toLocaleLowerCase().includes(needle)))
    .sort((left, right) => Number(Boolean(right.pinned)) - Number(Boolean(left.pinned)) || right.updatedAt - left.updatedAt)
    .slice(0, Math.max(1, limit))
}
