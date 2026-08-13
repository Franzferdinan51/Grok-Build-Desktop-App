import type { WorkspaceFile } from "../preload"

export const MAX_ATTACHED_FILES = 8

export function toggleAttachedFile(current: WorkspaceFile[], file: WorkspaceFile): WorkspaceFile[] {
  const existing = current.some((entry) => entry.path === file.path)
  if (existing) return current.filter((entry) => entry.path !== file.path)
  if (current.length >= MAX_ATTACHED_FILES) return current
  return [...current, file]
}

export function formatAttachedPrompt(prompt: string, files: WorkspaceFile[]): string {
  const text = prompt.trim()
  if (!files.length) return text
  const context = [
    "[Workspace files attached for context]",
    ...files.map((file) => `- ${file.path}`),
    "Read the attached workspace files before acting; they are context for the instruction below.",
  ].join("\n")
  return `${text}\n\n${context}`.trim()
}

