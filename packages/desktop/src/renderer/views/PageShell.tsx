import { For, Show, type JSX } from "solid-js"

export type PageTab = { id: string; label: string; meta?: string | number }

export function PageEmpty(props: { mark: string; title: string; body: string; children?: JSX.Element }) {
  return <div class="page-empty">
    <span class="page-empty__mark">{props.mark}</span>
    <h2>{props.title}</h2>
    <p>{props.body}</p>
    <Show when={props.children}><div class="page-empty__actions">{props.children}</div></Show>
  </div>
}

export function PageShell(props: {
  eyebrow: string
  title: string
  subtitle?: string
  search?: { value: string; placeholder: string; onInput: (value: string) => void; hidden?: boolean }
  tabs?: PageTab[]
  activeTab?: string
  onTab?: (id: string) => void
  actions?: JSX.Element
  children: JSX.Element
  class?: string
}) {
  return <section class={`page-shell ${props.class || ""}`}>
    <header class="page-shell__bar">
      <div class="page-shell__search">
        <Show when={props.search && !props.search.hidden}>
          <input
            value={props.search!.value}
            placeholder={props.search!.placeholder}
            onInput={(event) => props.search!.onInput(event.currentTarget.value)}
          />
        </Show>
      </div>
      <div class="page-shell__identity">
        <span class="eyebrow">{props.eyebrow}</span>
        <strong>{props.title}</strong>
        <Show when={props.subtitle}><span>{props.subtitle}</span></Show>
      </div>
      <div class="page-shell__actions">{props.actions}</div>
    </header>
    <Show when={props.tabs?.length}>
      <nav class="page-tabs" aria-label={props.title}>
        <For each={props.tabs}>{(tab) =>
          <button class={props.activeTab === tab.id ? "active" : ""} onClick={() => props.onTab?.(tab.id)}>
            {tab.label}
            <Show when={tab.meta !== undefined}><i>{tab.meta}</i></Show>
          </button>
        }</For>
      </nav>
    </Show>
    <div class="page-shell__body">{props.children}</div>
  </section>
}
