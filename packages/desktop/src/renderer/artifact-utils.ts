import type { StoredChatThread } from "../preload"

export type ArtifactKind = "image" | "file" | "link"
export type ArtifactFilter = "all" | ArtifactKind

export type ArtifactRecord = {
  id: string
  kind: ArtifactKind
  value: string
  label: string
  threadId: string
  threadTitle: string
  workspace: string
  createdAt: number
}

const IMAGE_EXT = /\.(?:png|jpe?g|gif|webp|svg|bmp)(?:[?#].*)?$/i
const FILE_EXT = /\.(?:pdf|txt|json|md|csv|zip|tar|gz|mp3|wav|mp4|mov|tsx?|jsx?|css|html)(?:[?#].*)?$/i
const MARKDOWN_LINK = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+[^)]*)?\)/g
const URL_RE = /https?:\/\/[^\s<>'"`)\]]+/g
const PATH = /(?:^|[\s("'`])((?:\.{0,2}\/|\/)[^\s<>"'`)\]]+\.[a-z0-9]{1,8})/gi
const MAX_ARTIFACTS = 500

function clean(value: string): string {
  return value.trim().replace(/[),.;:]+$/, "")
}

function isCandidate(value: string): boolean {
  return /^(?:https?:\/\/|file:\/\/|\.{0,2}\/|\/)/i.test(value)
}

function kindFor(value: string): ArtifactKind {
  if (value.startsWith("data:image/") || IMAGE_EXT.test(value)) return "image"
  if (/^(?:file:\/\/|\.{0,2}\/|\/)/i.test(value) || FILE_EXT.test(value)) return "file"
  return "link"
}

function labelFor(value: string): string {
  try {
    const url = new URL(value)
    return url.pathname.split("/").filter(Boolean).at(-1) || url.hostname
  } catch {
    return value.split(/[\\/]/).filter(Boolean).at(-1) || value
  }
}

function valuesFromText(text: string): string[] {
  const values = new Set<string>()
  for (const match of text.matchAll(MARKDOWN_LINK)) {
    const value = clean(match[1] || "")
    if (isCandidate(value)) values.add(value)
  }
  for (const match of text.matchAll(URL_RE)) values.add(clean(match[0]))
  for (const match of text.matchAll(PATH)) {
    const value = clean(match[1] || "")
    if (isCandidate(value)) values.add(value)
  }
  return [...values]
}

export function collectArtifacts(threads: StoredChatThread[]): ArtifactRecord[] {
  const records: ArtifactRecord[] = []
  const seen = new Set<string>()
  for (const thread of threads) {
    for (const message of thread.messages || []) {
      const text = (message.logs || []).filter((log) => log.kind !== "thought").map((log) => log.content).join("\n")
      for (const value of valuesFromText(text)) {
        const key = `${thread.id}:${value}`
        if (seen.has(key)) continue
        seen.add(key)
        records.push({
          id: key,
          kind: kindFor(value),
          value,
          label: labelFor(value),
          threadId: thread.id,
          threadTitle: thread.title || "Untitled conversation",
          workspace: thread.workspace,
          createdAt: message.createdAt
        })
        if (records.length >= MAX_ARTIFACTS) return records.sort((a, b) => b.createdAt - a.createdAt)
      }
    }
  }
  return records.sort((a, b) => b.createdAt - a.createdAt)
}

export function filterArtifacts(records: ArtifactRecord[], query: string, filter: ArtifactFilter): ArtifactRecord[] {
  const needle = query.trim().toLowerCase()
  return records.filter((record) => {
    if (filter !== "all" && record.kind !== filter) return false
    return !needle || `${record.label} ${record.value} ${record.threadTitle} ${record.workspace}`.toLowerCase().includes(needle)
  })
}
