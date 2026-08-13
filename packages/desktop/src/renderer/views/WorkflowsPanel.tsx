import { For, Show, createMemo, createSignal } from "solid-js"
import type { GrokWorkflow } from "../../preload"
import { filterWorkflows, groupWorkflows, workflowScopeCounts, type WorkflowFilter } from "../page-lists"
import { PageEmpty, PageShell } from "./PageShell"
import { UI_ICONS } from "../assets/ui-icons"

export function WorkflowsPanel(props: {
  workflows: GrokWorkflow[]
  search: string
  onSearch: (value: string) => void
  onRefresh: () => void
  onRun: (name: string) => void
  workspaceName: string
}) {
  const [scope, setScope] = createSignal<WorkflowFilter>("all")
  const [selected, setSelected] = createSignal("")
  const visible = createMemo(() => filterWorkflows(props.workflows, props.search, scope()))
  const groups = createMemo(() => groupWorkflows(visible()))
  const counts = createMemo(() => workflowScopeCounts(props.workflows))
  const active = createMemo(() => visible().find((workflow) => workflow.name === selected()) || visible()[0])

  return <PageShell
    class="page-shell--page"
    eyebrow="GROK BUILD WORKFLOWS"
    title="Project and user workflows"
    subtitle="Official Rhai scripts from .grok/workflows and ~/.grok/workflows. Launch is grok -p “/workflow name” — there is no grok workflow subcommand."
    search={{ value: props.search, placeholder: "Search workflows", onInput: props.onSearch, hidden: !props.workflows.length }}
    tabs={[
      { id: "all", label: "All", meta: counts().all },
      { id: "project", label: "Project", meta: counts().project },
      { id: "user", label: "User", meta: counts().user },
    ]}
    activeTab={scope()}
    onTab={(id) => setScope(id as WorkflowFilter)}
    actions={<button onClick={() => props.onRefresh()}>Refresh</button>}
  >
    <Show when={props.workflows.length} fallback={
      <PageEmpty mark="◇" icon={UI_ICONS.workflows} title="No workflows discovered" body={`Add a .rhai script under ${props.workspaceName || "this project"}/.grok/workflows or ~/.grok/workflows. Duck-Agent presets remain available as /workflow plan|research|code|operate.`}>
        <button onClick={() => props.onRefresh()}>Refresh workflows</button>
      </PageEmpty>
    }>
      <Show when={visible().length} fallback={<PageEmpty mark="◇" icon={UI_ICONS.workflows} title="No matching workflows" body="Try another search or switch scope." />}>
        <div class="master-detail">
          <aside class="list-column">
            <For each={groups()}>{(group) =>
              <div class="list-group">
                <span class="list-group__label">{group.scope}</span>
                <For each={group.items}>{(workflow) =>
                  <button class={`list-row ${active()?.name === workflow.name ? "active" : ""}`} onClick={() => setSelected(workflow.name)}>
                    <strong>{workflow.name}</strong>
                    <span>{workflow.description || workflow.path}</span>
                  </button>
                }</For>
              </div>
            }</For>
          </aside>
          <Show when={active()}>{(workflow) =>
            <article class="detail-column">
              <header>
                <span class={`skill-scope skill-scope--${workflow().scope}`}>{workflow().scope}</span>
                <h2>{workflow().name}</h2>
                <p>{workflow().description || "No description in the Rhai meta map."}</p>
              </header>
              <dl class="detail-meta">
                <div><dt>Path</dt><dd>{workflow().path}</dd></div>
                <div><dt>Command</dt><dd>/workflow {workflow().name}</dd></div>
              </dl>
              <div class="detail-actions">
                <button class="primary" onClick={() => props.onRun(workflow().name)}>Run through Grok Build</button>
              </div>
            </article>
          }</Show>
        </div>
      </Show>
    </Show>
  </PageShell>
}
