export function isNearBottom(scrollHeight: number, scrollTop: number, clientHeight: number, threshold = 100): boolean {
  return scrollHeight - scrollTop - clientHeight < threshold
}
