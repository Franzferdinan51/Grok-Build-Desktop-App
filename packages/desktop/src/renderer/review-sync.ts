export type ReviewChange = { path: string; status: string; staged?: boolean }

export function preservedReviewPath(changes: ReviewChange[], selectedPath: string): string {
  return selectedPath && changes.some((change) => change.path === selectedPath) ? selectedPath : ""
}
