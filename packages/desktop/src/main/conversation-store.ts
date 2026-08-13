import { app } from "electron"
import { randomUUID } from "crypto"
import { mkdir, readFile, readdir, rename, unlink, writeFile } from "fs/promises"
import { join } from "path"
import { rankConversationMatches } from "./conversation-search"
import { conversationToMarkdown } from "./conversation-markdown"
import { conversationSummary } from "./conversation-summary.ts"
export type { StoredChatLog, StoredChatMessage, StoredChatSummary, StoredChatThread } from "./conversation-store-types.ts"
import type { StoredChatThread, StoredChatSummary } from "./conversation-store-types.ts"

const directory = () => join(app.getPath("userData"), "conversations")
const fileFor = (id: string) => join(directory(), `${id.replace(/[^a-zA-Z0-9-]/g, "")}.json`)
const summaryFileFor = (id: string) => join(directory(), `${id.replace(/[^a-zA-Z0-9-]/g, "")}.summary.json`)
let writes = Promise.resolve()

async function atomicWrite(thread: StoredChatThread): Promise<void> {
  await mkdir(directory(), { recursive: true })
  const target = fileFor(thread.id)
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`
  const summaryTarget = summaryFileFor(thread.id)
  const summaryTemporary = `${summaryTarget}.${process.pid}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, JSON.stringify(thread), { encoding: "utf8", mode: 0o600 })
    await rename(temporary, target)
    await writeFile(summaryTemporary, JSON.stringify(conversationSummary(thread)), { encoding: "utf8", mode: 0o600 })
    await rename(summaryTemporary, summaryTarget)
  } catch (error) {
    await unlink(temporary).catch(() => undefined)
    await unlink(summaryTemporary).catch(() => undefined)
    throw error
  }
}

export function saveConversation(thread: StoredChatThread): Promise<StoredChatThread> {
  const normalized = { ...thread, workspace: thread.workspace || "", messages: thread.messages || [] }
  // A transient failed write must not poison the queue and prevent every
  // later conversation from being saved for the rest of the app session.
  writes = writes.catch(() => undefined).then(() => atomicWrite(normalized))
  return writes.then(() => normalized)
}

export async function listConversations(workspace?: string): Promise<StoredChatThread[]> {
  await writes
  await mkdir(directory(), { recursive: true })
  const names = await readdir(directory())
  const threads = await Promise.all(names.filter((name) => name.endsWith(".json") && !name.endsWith(".summary.json")).map(async (name) => {
    try { return JSON.parse(await readFile(join(directory(), name), "utf8")) as StoredChatThread }
    catch { return null }
  }))
  return threads.filter((thread): thread is StoredChatThread => Boolean(thread && (!workspace || thread.workspace === workspace)))
    .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.updatedAt - a.updatedAt)
}

export async function listConversationSummaries(workspace?: string): Promise<StoredChatSummary[]> {
  await writes
  await mkdir(directory(), { recursive: true })
  const names = (await readdir(directory())).filter((name) => name.endsWith(".json") && !name.endsWith(".summary.json"))
  const summaries = await Promise.all(names.map(async (name) => {
    const summaryName = name.replace(/\.json$/, ".summary.json")
    try {
      return JSON.parse(await readFile(join(directory(), summaryName), "utf8")) as StoredChatSummary
    } catch {
      // Older installations do not have sidecars yet. They are upgraded on
      // the next conversation save, while remaining fully readable now.
      try {
        const thread = JSON.parse(await readFile(join(directory(), name), "utf8")) as StoredChatThread
        const summary = conversationSummary(thread)
        // Upgrade legacy transcript-only files in the background. The current
        // request still returns immediately, while the next launch can use the
        // compact sidecar without parsing the large message array.
        void saveConversation(thread)
        return summary
      } catch { return null }
    }
  }))
  return summaries.filter((thread): thread is StoredChatSummary => Boolean(thread && (!workspace || thread.workspace === workspace)))
    .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.updatedAt - a.updatedAt)
}

export async function getConversation(id: string): Promise<StoredChatThread | undefined> {
  await writes
  try { return JSON.parse(await readFile(fileFor(id), "utf8")) as StoredChatThread } catch { return undefined }
}

export async function searchConversations(query: string, workspace?: string): Promise<StoredChatThread[]> {
  const threads = await listConversations(workspace)
  return rankConversationMatches(threads, query)
}

export async function exportConversation(id: string): Promise<string> {
  const thread = await getConversation(id)
  if (!thread) throw new Error("Conversation not found")
  return conversationToMarkdown(thread)
}
