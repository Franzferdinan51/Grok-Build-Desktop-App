/**
 * Per-thread composer draft + attachment stash. Persisted like
 * `chat.queue.${threadId}` so unsent text does not leak across chats.
 */

import { MAX_ATTACHED_FILES } from "./attached-files.ts"
import type { WorkspaceFile } from "../preload"

export type ComposerDraft = { text: string; attachments: WorkspaceFile[] }

export const EMPTY_COMPOSER_DRAFT: ComposerDraft = { text: "", attachments: [] }
const MAX_DRAFT_TEXT = 32_000
const MAX_DRAFT_PATH = 1024

export function composerDraftIsEmpty(draft: ComposerDraft): boolean {
  return !draft.text.trim() && draft.attachments.length === 0
}

export function composeDraftSnapshot(text: string, attachments: WorkspaceFile[]): ComposerDraft {
  return {
    text: text.slice(0, MAX_DRAFT_TEXT),
    attachments: attachments.slice(0, MAX_ATTACHED_FILES).map((file) => ({
      path: file.path.trim().slice(0, MAX_DRAFT_PATH),
      size: Number.isFinite(file.size) ? file.size : 0,
    })).filter((file) => file.path),
  }
}

export function parseComposerDraft(raw: unknown): ComposerDraft {
  if (!raw || typeof raw !== "object") return { ...EMPTY_COMPOSER_DRAFT }
  const record = raw as Record<string, unknown>
  const text = typeof record.text === "string" ? record.text.slice(0, MAX_DRAFT_TEXT) : ""
  const attachments: WorkspaceFile[] = []
  if (Array.isArray(record.attachments)) {
    for (const item of record.attachments) {
      if (!item || typeof item !== "object") continue
      const file = item as Record<string, unknown>
      if (typeof file.path !== "string") continue
      const path = file.path.trim().slice(0, MAX_DRAFT_PATH)
      if (!path) continue
      attachments.push({
        path,
        size: typeof file.size === "number" && Number.isFinite(file.size) ? file.size : 0,
      })
      if (attachments.length >= MAX_ATTACHED_FILES) break
    }
  }
  return { text, attachments }
}
