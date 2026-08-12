import { app } from "electron"
import { randomUUID } from "crypto"
import { mkdir, readFile, readdir, rename, unlink, writeFile } from "fs/promises"
import { join } from "path"
import { rankConversationMatches } from "./conversation-search"
import { conversationToMarkdown } from "./conversation-markdown"

export type StoredChatLog = { kind: "text" | "thought" | "error"; content: string }
export type StoredChatMessage = { id: string; role: "user" | "assistant"; logs: StoredChatLog[]; createdAt: number }
export type StoredChatThread = {
  id: string; workspace: string; title: string; createdAt: number; updatedAt: number
  messages: StoredChatMessage[]; sessionId: string; model?: string; summary?: string
  pinned?: boolean; archived?: boolean; sessionStatus?: "new" | "resumable" | "recovered" | "broken"
}
export type StoredChatSummary = Omit<StoredChatThread, "messages"> & { messageCount: number }

const directory = () => join(app.getPath("userData"), "conversations")
const fileFor = (id: string) => join(directory(), `${id.replace(/[^a-zA-Z0-9-]/g, "")}.json`)
let writes = Promise.resolve()

async function atomicWrite(thread: StoredChatThread): Promise<void> {
  await mkdir(directory(), { recursive: true })
  const target = fileFor(thread.id)
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, JSON.stringify(thread), { encoding: "utf8", mode: 0o600 })
    await rename(temporary, target)
  } catch (error) {
    await unlink(temporary).catch(() => undefined)
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
  const threads = await Promise.all(names.filter((name) => name.endsWith(".json")).map(async (name) => {
    try { return JSON.parse(await readFile(join(directory(), name), "utf8")) as StoredChatThread }
    catch { return null }
  }))
  return threads.filter((thread): thread is StoredChatThread => Boolean(thread && (!workspace || thread.workspace === workspace)))
    .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.updatedAt - a.updatedAt)
}

export async function listConversationSummaries(workspace?: string): Promise<StoredChatSummary[]> {
  const threads = await listConversations(workspace)
  return threads.map(({ messages, ...thread }) => ({ ...thread, messageCount: messages.length }))
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
