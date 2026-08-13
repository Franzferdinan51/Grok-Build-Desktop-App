export const DEFAULT_TRANSCRIPT_PAGE_SIZE = 40

export function visibleTranscriptStart(total: number, visibleCount: number): number {
  if (total <= 0) return 0
  return Math.max(0, total - Math.max(1, visibleCount))
}

export function transcriptPage(total: number, visibleCount: number): { start: number; hidden: number } {
  const start = visibleTranscriptStart(total, visibleCount)
  return { start, hidden: start }
}

export function expandTranscript(visibleCount: number, pageSize = DEFAULT_TRANSCRIPT_PAGE_SIZE): number {
  return visibleCount + Math.max(1, pageSize)
}
