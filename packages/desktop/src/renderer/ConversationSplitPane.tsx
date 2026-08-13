import DOMPurify from "dompurify"
import { marked } from "marked"
import { For, Show } from "solid-js"
import type { StoredChatThread } from "../preload"
import { splitThinking, type TaskLog } from "./chat-utils"

type ChatMessage = { id: string; role: "user" | "assistant"; logs: TaskLog[]; createdAt: number }
type ChatThread = StoredChatThread & { messages: ChatMessage[] }

function RichText(props: { content: string }) {
  const html = () => DOMPurify.sanitize(marked.parse(props.content, { async: false }) as string)
  return <div class="rich-text" innerHTML={html()} />
}

export function ConversationSplitPane(props: { threads: ChatThread[]; activeId: string; onSelect: (id: string) => void; onClose: (id: string) => void; onFocus: () => void }) {
  const thread = () => props.threads.find((entry) => entry.id === props.activeId) || props.threads[0]
  return <aside class="conversation-split-pane" aria-label={`Conversation dock: ${thread()?.title || "Saved conversations"}`}>
    <header>
      <div><span class="eyebrow">SESSION DOCK · {props.threads.length}</span><strong>{thread()?.title || "Saved conversations"}</strong><small>{thread()?.workspace.split(/[\\/]/).filter(Boolean).at(-1) || "Scratch"} · read only</small></div>
      <div class="conversation-split-pane__actions"><button onClick={props.onFocus} title="Focus this conversation">Focus</button><button onClick={() => thread() && props.onClose(thread()!.id)} title="Close this conversation">×</button></div>
    </header>
    <nav class="conversation-split-pane__tabs" aria-label="Docked conversations"><For each={props.threads}>{(entry) => <button class={entry.id === thread()?.id ? "active" : ""} onClick={() => props.onSelect(entry.id)} title={entry.title}>{entry.title}</button>}</For></nav>
    <div class="conversation-split-pane__messages">
      <Show when={thread()?.messages.length} fallback={<div class="conversation-split-pane__empty"><span>◇</span><strong>New conversation</strong><p>Focus this pane to start working in it.</p></div>}>
        <For each={thread()?.messages || []}>{(message) => <article class={`split-message split-message--${message.role}`}>
          <div class="split-message__meta">{message.role === "assistant" ? "Grok Build" : "You"} · {new Date(message.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</div>
          <For each={splitThinking(message.logs)}>{(entry) => <Show when={entry.kind !== "thought"} fallback={<details class="split-message__thinking"><summary>Thought process</summary><pre>{entry.content}</pre></details>}><Show when={entry.kind === "text"} fallback={<pre class="split-message__error">{entry.content}</pre>}><RichText content={entry.content} /></Show></Show>}</For>
        </article>}</For>
      </Show>
    </div>
    <footer>Read-only dock · focus a conversation to send a task</footer>
  </aside>
}
