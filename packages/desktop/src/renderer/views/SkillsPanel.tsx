import { For, Show, createMemo, createSignal } from "solid-js"
import type { GrokSkill } from "../../preload"
import { filterSkills, groupSkills, skillScopeCounts, type SkillFilter } from "../page-lists"
import { PageEmpty, PageShell } from "./PageShell"

export function SkillsPanel(props: {
  skills: GrokSkill[]
  search: string
  onSearch: (value: string) => void
  onRefresh: () => void
  onUseSkill: (name: string) => void
  workspaceName: string
}) {
  const [scope, setScope] = createSignal<SkillFilter>("all")
  const [selected, setSelected] = createSignal("")
  const visible = createMemo(() => filterSkills(props.skills, props.search, scope()))
  const groups = createMemo(() => groupSkills(visible()))
  const counts = createMemo(() => skillScopeCounts(props.skills))
  const active = createMemo(() => visible().find((skill) => skill.name === selected()) || visible()[0])

  return <PageShell
    class="page-shell--page"
    eyebrow="GROK BUILD SKILLS"
    title="Project and user skills"
    subtitle="Discovered from Grok, agent, Claude, and Cursor-compatible skill directories. Project skills win on name conflicts."
    search={{ value: props.search, placeholder: "Search skills", onInput: props.onSearch, hidden: !props.skills.length }}
    tabs={[
      { id: "all", label: "All", meta: counts().all },
      { id: "project", label: "Project", meta: counts().project },
      { id: "user", label: "User", meta: counts().user },
      { id: "compatible", label: "Compatible", meta: counts().compatible },
    ]}
    activeTab={scope()}
    onTab={(id) => setScope(id as SkillFilter)}
    actions={<button onClick={() => props.onRefresh()}>Refresh</button>}
  >
    <Show when={props.skills.length} fallback={
      <PageEmpty mark="◇" title="No skills discovered" body={`Grok Build looks in this project (${props.workspaceName || "Scratch"}) and your user skill directories. Refresh after adding a SKILL.md.`}>
        <button onClick={() => props.onRefresh()}>Refresh skills</button>
      </PageEmpty>
    }>
      <Show when={visible().length} fallback={<PageEmpty mark="◇" title="No matching skills" body="Try another search or switch scope." />}>
        <div class="master-detail">
          <aside class="list-column">
            <For each={groups()}>{(group) =>
              <div class="list-group">
                <span class="list-group__label">{group.scope}</span>
                <For each={group.items}>{(skill) =>
                  <button class={`list-row ${active()?.name === skill.name ? "active" : ""}`} onClick={() => setSelected(skill.name)}>
                    <strong>{skill.name}</strong>
                    <span>{skill.description || skill.path}</span>
                  </button>
                }</For>
              </div>
            }</For>
          </aside>
          <Show when={active()}>{(skill) =>
            <article class="detail-column">
              <header>
                <span class={`skill-scope skill-scope--${skill().scope}`}>{skill().scope}</span>
                <h2>{skill().name}</h2>
                <p>{skill().description || "No description in SKILL.md."}</p>
              </header>
              <dl class="detail-meta">
                <div><dt>Path</dt><dd>{skill().path}</dd></div>
                <div><dt>Command</dt><dd>/{skill().name}</dd></div>
              </dl>
              <div class="detail-actions">
                <button class="primary" onClick={() => props.onUseSkill(skill().name)}>Use in chat</button>
              </div>
            </article>
          }</Show>
        </div>
      </Show>
    </Show>
  </PageShell>
}
