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

export function ConversationSplitPane(props: { thread: ChatThread; onClose: () => void; onFocus: () => void }) {
  return <aside class="conversation-split-pane" aria-label={`Conversation preview: ${props.thread.title}`}>
    <header>
      <div><span class="eyebrow">SECONDARY SESSION</span><strong>{props.thread.title}</strong><small>{props.thread.workspace.split(/[\\/]/).filter(Boolean).at(-1) || "Scratch"} · read only</small></div>
      <div class="conversation-split-pane__actions"><button onClick={props.onFocus} title="Focus this conversation">Focus</button><button onClick={props.onClose} title="Close split conversation">×</button></div>
    </header>
    <div class="conversation-split-pane__messages">
      <Show when={props.thread.messages.length} fallback={<div class="conversation-split-pane__empty"><span>◇</span><strong>New conversation</strong><p>Focus this pane to start working in it.</p></div>}>
        <For each={props.thread.messages}>{(message) => <article class={`split-message split-message--${message.role}`}>
          <div class="split-message__meta">{message.role === "assistant" ? "Grok Build" : "You"} · {new Date(message.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</div>
          <For each={splitThinking(message.logs)}>{(entry) => <Show when={entry.kind !== "thought"} fallback={<details class="split-message__thinking"><summary>Thought process</summary><pre>{entry.content}</pre></details>}><Show when={entry.kind === "text"} fallback={<pre class="split-message__error">{entry.content}</pre>}><RichText content={entry.content} /></Show></Show>}</For>
        </article>}</For>
      </Show>
    </div>
    <footer>Execution stays on the focused conversation · switch focus to send a task</footer>
  </aside>
}
