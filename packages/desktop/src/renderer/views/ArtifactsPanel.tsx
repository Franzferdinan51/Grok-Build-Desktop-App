import { createMemo, createSignal, For, Show } from "solid-js"
import type { ArtifactFilter, ArtifactRecord } from "../artifact-utils"
import { filterArtifacts } from "../artifact-utils"
import { PageEmpty, PageShell } from "./PageShell"
import { UI_ICONS } from "../assets/ui-icons"

export function ArtifactsPanel(props: { artifacts: () => ArtifactRecord[]; onRefresh: () => void; onOpenThread: (id: string) => void }) {
  const [query, setQuery] = createSignal("")
  const [filter, setFilter] = createSignal<ArtifactFilter>("all")
  const visible = createMemo(() => filterArtifacts(props.artifacts(), query(), filter()))
  const counts = createMemo(() => {
    const records = props.artifacts()
    return { all: records.length, image: records.filter((item) => item.kind === "image").length, file: records.filter((item) => item.kind === "file").length, link: records.filter((item) => item.kind === "link").length }
  })

  const openArtifact = (record: ArtifactRecord) => {
    if (/^https?:\/\//i.test(record.value)) void window.api.app.openExternal(record.value)
    else void navigator.clipboard.writeText(record.value)
  }

  return <PageShell
    class="page-shell--page"
    eyebrow="SESSION ARTIFACTS"
    title="Links, files, and images from your work"
    subtitle="A searchable index built from persisted Grok Build conversations."
    search={{ value: query(), placeholder: "Search artifacts, chats, projects", onInput: setQuery, hidden: !props.artifacts().length }}
    tabs={(Object.keys(counts()) as ArtifactFilter[]).map((id) => ({ id, label: id === "all" ? "All" : id[0]!.toUpperCase() + id.slice(1), meta: counts()[id] }))}
    activeTab={filter()}
    onTab={(id) => setFilter(id as ArtifactFilter)}
    actions={<button onClick={() => props.onRefresh()}>Refresh</button>}
  >
    <Show when={props.artifacts().length} fallback={<PageEmpty mark="◇" icon={UI_ICONS.artifacts} title="No artifacts yet" body="Links, files, and images mentioned in completed conversations will appear here." />}>
      <Show when={visible().length} fallback={<PageEmpty mark="◇" icon={UI_ICONS.artifacts} title="No matching artifacts" body="Try a different search or artifact type." />}>
        <div class="artifact-grid"><For each={visible()}>{(record) => <article class={`artifact-card artifact-card--${record.kind}`}>
          <div class="artifact-card__icon">{record.kind === "image" ? "▧" : record.kind === "file" ? "□" : "↗"}</div>
          <div class="artifact-card__body"><strong title={record.value}>{record.label}</strong><span>{record.value}</span><small>{record.threadTitle} · {record.workspace.split(/[\\/]/).filter(Boolean).at(-1) || "Scratch"}</small></div>
          <div class="artifact-card__actions"><button onClick={() => openArtifact(record)}>{/^https?:\/\//i.test(record.value) ? "Open" : "Copy"}</button><button onClick={() => props.onOpenThread(record.threadId)}>Chat</button></div>
        </article>}</For></div>
      </Show>
    </Show>
  </PageShell>
}
