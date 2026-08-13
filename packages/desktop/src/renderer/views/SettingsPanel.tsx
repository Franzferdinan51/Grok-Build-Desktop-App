import { For, Show } from "solid-js"
import type { BackendStatus, GrokBuildModelCatalog, GrokBuildUpdateStatus, GrokSubcommand, OAuthProviderStatus, OAuthStatusSnapshot, ProviderSecret } from "../../preload"
import { groupedModelOptions, type ModelOption } from "../provider-availability"
import { SETTINGS_TABS, type AdvancedSettings, type SettingsTab } from "../settings-defaults"
import { PageShell } from "./PageShell"
import grokBuildLogo from "../assets/grok-build-logo.png"

function GroupedModelSelect(props: {
  value: string
  emptyLabel: string
  options: ModelOption[]
  onChange: (value: string) => void
}) {
  return <select value={props.value} onChange={(event) => props.onChange(event.currentTarget.value)}>
    <option value="">{props.emptyLabel}</option>
    <For each={groupedModelOptions(props.options)}>{(group) =>
      <optgroup label={group.label}>
        <For each={group.options}>{(entry) =>
          <option value={entry.id} disabled={!entry.available}>{entry.available ? entry.label : `${entry.label} — ${entry.reason}`}</option>
        }</For>
      </optgroup>
    }</For>
  </select>
}

const safeToolCommand = (name: string) => {
  if (["inspect", "doctor", "du"].includes(name)) return `${name} --json`
  if (["mcp", "plugin", "sessions", "worktree"].includes(name)) return `${name} list`
  if (["models", "version", "dashboard"].includes(name)) return name
  return `${name} --help`
}

function oauthTone(row?: OAuthProviderStatus): "ok" | "warn" | "missing" {
  if (!row) return "missing"
  if (row.signedIn) return "ok"
  if (!row.helperAvailable) return "missing"
  return "warn"
}

export function SettingsPanel(props: {
  tab: SettingsTab
  onTab: (tab: SettingsTab) => void
  search: string
  onSearch: (value: string) => void
  backend: BackendStatus
  catalog: GrokBuildModelCatalog
  modelOptions: ModelOption[]
  oauth: OAuthStatusSnapshot
  oauthNotice: string
  oauthBusy?: OAuthProviderStatus["id"] | ""
  onSignIn: (provider: OAuthProviderStatus["id"]) => void
  onRefreshOauth: () => void
  cliPath: string
  onCliPath: (value: string) => void
  onSaveCli: () => void
  cliNotice: string
  grokAutoUpdate: boolean
  onAutoUpdate: (value: boolean) => void
  grokUpdateChannel: "stable" | "alpha"
  onUpdateChannel: (value: "stable" | "alpha") => void
  grokUpdate: GrokBuildUpdateStatus | null
  grokUpdateNotice: string
  onCheckUpdate: () => void
  onInstallUpdate: () => void
  model: string
  onModel: (value: string) => void
  thinking: boolean
  onThinking: (value: boolean) => void
  autoApprove: boolean
  onAutoApprove: (value: boolean) => void
  selfVerify: boolean
  onSelfVerify: (value: boolean) => void
  webSearch: boolean
  onWebSearch: (value: boolean) => void
  maxTurns: number
  onMaxTurns: (value: number) => void
  moaEnabled: boolean
  onMoaEnabled: (value: boolean) => void
  moaCandidates: number
  onMoaCandidates: (value: number) => void
  moaReferenceModels: string[]
  onMoaReferenceModels: (value: string[]) => void
  moaAggregatorModel: string
  onMoaAggregatorModel: (value: string) => void
  moaReferenceEffort: "low" | "medium" | "high"
  onMoaReferenceEffort: (value: "low" | "medium" | "high") => void
  moaAggregatorEffort: "low" | "medium" | "high"
  onMoaAggregatorEffort: (value: "low" | "medium" | "high") => void
  moaReferenceTokenBudget: number
  onMoaReferenceTokenBudget: (value: number) => void
  advanced: AdvancedSettings
  onAdvanced: <K extends keyof AdvancedSettings>(key: K, value: AdvancedSettings[K]) => void
  subagentsEnabled: boolean
  onSubagents: (value: boolean) => void
  delegationMode: "balanced" | "aggressive"
  onDelegationMode: (value: "balanced" | "aggressive") => void
  autoLearnEnabled: boolean
  onAutoLearnEnabled: (value: boolean) => void
  autoLearnInterval: number
  onAutoLearnInterval: (value: number) => void
  autoLearnModel: string
  onAutoLearnModel: (value: string) => void
  autoLearnStatus: string
  previewEnabled: boolean
  onPreviewEnabled: (value: boolean) => void
  previewDraft: string
  onPreviewDraft: (value: string) => void
  onSavePreview: () => void
  agentAppControls: boolean
  onAgentAppControls: (value: boolean) => void
  backendToolCommand: string
  onBackendToolCommand: (value: string) => void
  backendToolOutput: string
  backendToolRunning: boolean
  backendCommands: GrokSubcommand[]
  onRunBackendTool: (command?: string) => void
  providerSecrets: ProviderSecret[]
  endpointDrafts: Record<string, string>
  modelDrafts: Record<string, string>
  secretDrafts: Record<string, string>
  providerNotices: Record<string, string>
  onEndpointDraft: (id: string, value: string) => void
  onModelDraft: (id: string, value: string) => void
  onSecretDraft: (id: string, value: string) => void
  onSaveProvider: (id: string) => void
  onSaveSecret: (id: string) => void
  onTestProvider: (id: string) => void
  onRemoveSecret: (id: string) => void
  onRemoveProvider: (id: string) => void
  customName: string
  customURL: string
  customModel: string
  onCustomName: (value: string) => void
  onCustomURL: (value: string) => void
  onCustomModel: (value: string) => void
  onAddProvider: () => void
  onOpenExternal: (url: string) => void
}) {
  const query = () => props.search.trim().toLowerCase()
  const showCard = (title: string, keywords = "") => {
    const needle = query()
    if (!needle) return true
    return `${title} ${keywords}`.toLowerCase().includes(needle)
  }
  const xai = () => props.oauth.providers.find((row) => row.id === "xai")
  const signedInCount = () => props.oauth.providers.filter((row) => row.signedIn).length

  return <PageShell
    class="page-shell--page settings-page"
    eyebrow="GROK BUILD SETTINGS"
    title="Sign in, defaults, and Advanced"
    subtitle={props.backend.available ? `${props.backend.version || props.backend.command} · ${signedInCount()} provider${signedInCount() === 1 ? "" : "s"} signed in` : props.backend.error || "Grok Build CLI unavailable"}
    search={{ value: props.search, placeholder: "Search settings", onInput: props.onSearch }}
    tabs={SETTINGS_TABS.map((tab) => ({ id: tab.id, label: tab.label }))}
    activeTab={props.tab}
    onTab={(id) => props.onTab(id as SettingsTab)}
    actions={<button onClick={() => props.onRefreshOauth()}>Refresh sign-in</button>}
  >
    <Show when={props.tab === "essentials"}>
      <div class="settings-brand">
        <img src={grokBuildLogo} alt="" />
        <div>
          <span class="eyebrow">Everyday setup</span>
          <h1>Get coding quickly.</h1>
          <p>Sign in, pick a default model, and keep the rest on CLI-like defaults. Power flags live in Advanced. Backend: <button class="link-button" onClick={() => props.onOpenExternal("https://github.com/xai-org/grok-build")}>xai-org/grok-build</button>.</p>
        </div>
      </div>

      <Show when={showCard("Provider sign-in", "oauth xai openai minimax login")}>
        <div class="settings-card">
          <div>
            <strong>Provider sign-in</strong>
            <span>Official OAuth only. Tokens stay with the helper CLIs — this page never stores them.</span>
          </div>
          <Show when={!xai()?.signedIn}>
            <p class="settings-callout">Sign in with xAI first. That is the Grok Build default and unlocks the catalog immediately.</p>
          </Show>
          <div class="oauth-provider-list">
            <For each={props.oauth.providers}>{(row) =>
              <div class="oauth-provider-row">
                <div>
                  <strong>{row.label}</strong>
                  <span>{row.detail}</span>
                </div>
                <em class={`oauth-status oauth-status--${oauthTone(row)}`}>{row.signedIn ? "Signed in" : row.helperAvailable ? "Not signed in" : "Helper missing"}</em>
                <button class={row.id === "xai" ? "primary" : ""} disabled={props.oauthBusy === row.id} onClick={() => props.onSignIn(row.id)}>
                  {props.oauthBusy === row.id ? "Opening…" : row.signedIn ? "Sign in again" : `Sign in with ${row.id === "xai" ? "xAI" : row.id === "openai" ? "OpenAI" : "MiniMax"}`}
                </button>
              </div>
            }</For>
          </div>
          <Show when={props.oauthNotice}><p class="provider-notice">{props.oauthNotice}</p></Show>
          <p class="provider-notice">xAI uses <code>grok login --oauth</code>. MiniMax uses <code>mmx auth login</code>. OpenAI Codex uses Hermes, then a local token-isolated bridge. Finish the Terminal/browser step, then this page refreshes models automatically.</p>
        </div>
      </Show>

      <Show when={showCard("Coding defaults", "model thinking web search approve")}>
        <div class="settings-card">
          <div>
            <strong>Coding defaults</strong>
            <span>Fast, CLI-like session defaults. High reasoning and extra loops stay off until you need them.</span>
          </div>
          <div class="agent-defaults-grid">
            <label>Default model
              <GroupedModelSelect
                value={props.model}
                emptyLabel={props.catalog.defaultModel || "Grok Build default"}
                options={props.modelOptions}
                onChange={props.onModel}
              />
            </label>
            <label class="settings-switch"><input type="checkbox" checked={props.thinking} onChange={(event) => props.onThinking(event.currentTarget.checked)} /><span />High reasoning</label>
            <label class="settings-switch"><input type="checkbox" checked={props.webSearch} onChange={(event) => props.onWebSearch(event.currentTarget.checked)} /><span />Web search</label>
            <label class="settings-switch settings-switch--warning"><input type="checkbox" checked={props.autoApprove} onChange={(event) => props.onAutoApprove(event.currentTarget.checked)} /><span />Automatic approvals</label>
          </div>
          <p class="provider-notice">Permission mode defaults to <code>auto</code> so ordinary edits keep moving. Automatic approvals skip safety prompts and stay off unless you turn them on.</p>
        </div>
      </Show>

      <Show when={showCard("Grok Build CLI updates", "update channel stable alpha")}>
        <div class="settings-card">
          <div>
            <strong>Grok Build CLI updates</strong>
            <span>Uses the CLI’s official signed updater from xai-org/grok-build.</span>
          </div>
          <div class="agent-defaults-grid">
            <label class="settings-switch"><input type="checkbox" checked={props.grokAutoUpdate} onChange={(event) => props.onAutoUpdate(event.currentTarget.checked)} /><span />Install updates automatically</label>
            <label>Release channel
              <select value={props.grokUpdateChannel} onChange={(event) => props.onUpdateChannel(event.currentTarget.value as "stable" | "alpha")}>
                <option value="stable">Stable · weekly</option>
                <option value="alpha">Alpha · faster, less tested</option>
              </select>
            </label>
          </div>
          <div class="token-row">
            <button onClick={() => props.onCheckUpdate()}>Check for updates</button>
            <button class="primary" disabled={!props.grokUpdate?.updateAvailable} onClick={() => props.onInstallUpdate()}>Update now</button>
          </div>
          <Show when={props.grokUpdateNotice}><p class="provider-notice">{props.grokUpdateNotice}</p></Show>
          <p class="provider-notice">Automatic checks run shortly after launch and every six hours. Updates wait while a coding task is running.</p>
        </div>
      </Show>
    </Show>

    <Show when={props.tab === "accounts"}>
      <Show when={showCard("Add another provider", "openai compatible custom")}>
        <div class="settings-card">
          <strong>Add another OpenAI-compatible provider</strong>
          <div class="provider-fields">
            <label>Name<input value={props.customName} onInput={(event) => props.onCustomName(event.currentTarget.value)} placeholder="Together AI" /></label>
            <label>Base URL<input value={props.customURL} onInput={(event) => props.onCustomURL(event.currentTarget.value)} placeholder="https://api.example.com/v1" /></label>
            <label>Model ID<input value={props.customModel} onInput={(event) => props.onCustomModel(event.currentTarget.value)} placeholder="coding-model" /></label>
            <button onClick={() => props.onAddProvider()}>Add provider</button>
          </div>
        </div>
      </Show>
      <For each={props.providerSecrets}>{(provider) =>
        <Show when={showCard(provider.label, `${provider.envKey} ${provider.modelId}`)}>
          <article class="settings-card">
            <div><strong>{provider.label}</strong><span>{provider.envKey}</span></div>
            <div class="provider-fields">
              <label>Base URL<input value={props.endpointDrafts[provider.id] || ""} onInput={(event) => props.onEndpointDraft(provider.id, event.currentTarget.value)} /></label>
              <label>Model ID<input value={props.modelDrafts[provider.id] || ""} onInput={(event) => props.onModelDraft(provider.id, event.currentTarget.value)} placeholder="e.g. my-coding-model" /></label>
              <button onClick={() => props.onSaveProvider(provider.id)}>Save endpoint</button>
            </div>
            <div class="token-row">
              <input type="password" value={props.secretDrafts[provider.id] || ""} onInput={(event) => props.onSecretDraft(provider.id, event.currentTarget.value)} placeholder={provider.configured ? "Credential configured" : "Paste API key (optional for local)"} />
              <button class="primary" onClick={() => props.onSaveSecret(provider.id)}>Save key</button>
              <button onClick={() => props.onTestProvider(provider.id)}>Test</button>
              <Show when={provider.configured}><button onClick={() => props.onRemoveSecret(provider.id)}>Remove key</button></Show>
              <Show when={provider.id.startsWith("custom-")}><button onClick={() => props.onRemoveProvider(provider.id)}>Delete provider</button></Show>
            </div>
            <Show when={props.providerNotices[provider.id]}><p class="provider-notice">{props.providerNotices[provider.id]}</p></Show>
          </article>
        </Show>
      }</For>
      <p class="telegram-note">API keys stay in the main process. The model picker is still populated by <code>grok models</code>.</p>
    </Show>

    <Show when={props.tab === "advanced"}>
      <Show when={showCard("Grok Build CLI backend", "path probe binary")}>
        <div class="settings-card">
          <strong>Grok Build CLI backend</strong>
          <span>{props.backend.version || "Select a locally built fork binary or a PATH command."}</span>
          <div class="token-row">
            <input value={props.cliPath} onInput={(event) => props.onCliPath(event.currentTarget.value)} placeholder="/path/to/grok or grok" />
            <button class="primary" onClick={() => props.onSaveCli()}>Save + Probe</button>
          </div>
          <Show when={props.cliNotice}><p class="provider-notice">{props.cliNotice}</p></Show>
        </div>
      </Show>

      <Show when={showCard("Mixture of Agents", "moa advisor aggregator")}>
        <div class="settings-card">
          <div><strong>Mixture of Agents</strong><span>Parallel advisors with one tool-enabled acting aggregator.</span></div>
          <div class="moa-setting">
            <label class="settings-switch"><input type="checkbox" checked={props.moaEnabled} onChange={(event) => props.onMoaEnabled(event.currentTarget.checked)} /><span />Enable MoA</label>
            <label>Reference agents
              <select value={props.moaCandidates} onChange={(event) => props.onMoaCandidates(Number(event.currentTarget.value))}>
                <For each={[2, 3, 4, 5, 6, 8]}>{(count) => <option value={count}>{count}</option>}</For>
              </select>
            </label>
          </div>
          <div class="moa-reference-list">
            <For each={Array.from({ length: props.moaCandidates })}>{(_, index) =>
              <label>
                <span>Reference {index() + 1}</span>
                <GroupedModelSelect
                  value={props.moaReferenceModels[index()] || ""}
                  emptyLabel="Grok Build default"
                  options={props.modelOptions}
                  onChange={(value) => {
                    const next = [...props.moaReferenceModels]
                    next[index()] = value
                    props.onMoaReferenceModels(next)
                  }}
                />
              </label>
            }</For>
          </div>
          <label class="moa-aggregator">
            <span>Aggregator · acting model</span>
            <GroupedModelSelect value={props.moaAggregatorModel} emptyLabel="Grok Build default" options={props.modelOptions} onChange={props.onMoaAggregatorModel} />
          </label>
          <div class="moa-setting">
            <label>Reference effort
              <select value={props.moaReferenceEffort} onChange={(event) => props.onMoaReferenceEffort(event.currentTarget.value as "low" | "medium" | "high")}>
                <For each={["low", "medium", "high"] as const}>{(effort) => <option value={effort}>{effort}</option>}</For>
              </select>
            </label>
            <label>Aggregator effort
              <select value={props.moaAggregatorEffort} onChange={(event) => props.onMoaAggregatorEffort(event.currentTarget.value as "low" | "medium" | "high")}>
                <For each={["low", "medium", "high"] as const}>{(effort) => <option value={effort}>{effort}</option>}</For>
              </select>
            </label>
            <label>Advisor budget
              <input type="number" min="200" max="2000" step="100" value={props.moaReferenceTokenBudget} onInput={(event) => props.onMoaReferenceTokenBudget(Math.min(2000, Math.max(200, Number(event.currentTarget.value) || 600)))} />
              <small>tokens · default 600</small>
            </label>
          </div>
        </div>
      </Show>

      <Show when={showCard("More coding defaults", "self-verify turns")}>
        <div class="settings-card">
          <div><strong>More coding defaults</strong><span>Optional slower loops that stay off for everyday work.</span></div>
          <div class="agent-defaults-grid">
            <label>Maximum turns
              <input type="number" min="0" max="100" value={props.maxTurns} onInput={(event) => props.onMaxTurns(Math.min(100, Math.max(0, Number(event.currentTarget.value) || 0)))} />
              <small>0 uses the CLI default</small>
            </label>
            <label class="settings-switch"><input type="checkbox" checked={props.selfVerify} onChange={(event) => props.onSelfVerify(event.currentTarget.checked)} /><span />Self-verify changes</label>
          </div>
        </div>
      </Show>

      <Show when={showCard("Advanced Grok Build parity", "permission memory sandbox worktree")}>
        <div class="settings-card">
          <div><strong>Advanced Grok Build parity</strong><span>Native agents, permissions, memory, sandboxing, and worktrees.</span></div>
          <div class="advanced-settings-grid">
            <label>Agent name or definition<input value={props.advanced.agent} onInput={(event) => props.onAdvanced("agent", event.currentTarget.value)} placeholder="agent name or file path" /></label>
            <label>Inline subagent definitions (JSON)<textarea value={props.advanced.agents} onInput={(event) => props.onAdvanced("agents", event.currentTarget.value)} placeholder='{"reviewer":{"description":"Review changes"}}' /></label>
            <label>Permission mode
              <select value={props.advanced.permissionMode} onChange={(event) => props.onAdvanced("permissionMode", event.currentTarget.value as AdvancedSettings["permissionMode"])}>
                <For each={["default", "acceptEdits", "auto", "dontAsk", "bypassPermissions", "plan"] as const}>{(entry) => <option value={entry}>{entry}</option>}</For>
              </select>
            </label>
            <label>Memory
              <select value={props.advanced.memory} onChange={(event) => props.onAdvanced("memory", event.currentTarget.value as AdvancedSettings["memory"])}>
                <option value="default">DuckBot RAG primary</option>
                <option value="experimental">Experimental cross-session memory</option>
                <option value="disabled">Disable memory</option>
              </select>
            </label>
            <label>Allow rules<input value={props.advanced.allow} onInput={(event) => props.onAdvanced("allow", event.currentTarget.value)} placeholder="comma-separated permission rules" /></label>
            <label>Deny rules<input value={props.advanced.deny} onInput={(event) => props.onAdvanced("deny", event.currentTarget.value)} placeholder="comma-separated permission rules" /></label>
            <label>Allowed built-in tools<input value={props.advanced.tools} onInput={(event) => props.onAdvanced("tools", event.currentTarget.value)} placeholder="comma-separated tools" /></label>
            <label>Disabled built-in tools<input value={props.advanced.disallowedTools} onInput={(event) => props.onAdvanced("disallowedTools", event.currentTarget.value)} placeholder="comma-separated tools" /></label>
            <label>Sandbox profile<input value={props.advanced.sandbox} onInput={(event) => props.onAdvanced("sandbox", event.currentTarget.value)} placeholder="Grok sandbox profile" /></label>
            <label>Worktree name<input value={props.advanced.worktreeName} disabled={!props.advanced.worktree} onInput={(event) => props.onAdvanced("worktreeName", event.currentTarget.value)} placeholder="optional generated name" /></label>
            <label>Worktree base ref<input value={props.advanced.worktreeRef} disabled={!props.advanced.worktree} onInput={(event) => props.onAdvanced("worktreeRef", event.currentTarget.value)} placeholder="branch, tag, or commit" /></label>
            <label>Extra rules<textarea value={props.advanced.rules} onInput={(event) => props.onAdvanced("rules", event.currentTarget.value)} placeholder="Append rules to the system prompt" /></label>
            <label>System prompt override<textarea value={props.advanced.systemPrompt} onInput={(event) => props.onAdvanced("systemPrompt", event.currentTarget.value)} placeholder="Optional complete system prompt" /></label>
            <label>JSON Schema output<textarea value={props.advanced.jsonSchema} onInput={(event) => props.onAdvanced("jsonSchema", event.currentTarget.value)} placeholder='{"type":"object","properties":{}}' /></label>
          </div>
          <div class="advanced-switches">
            <label class="settings-switch"><input type="checkbox" checked={props.advanced.verbatim} onChange={(event) => props.onAdvanced("verbatim", event.currentTarget.checked)} /><span />Verbatim prompt</label>
            <label class="settings-switch"><input type="checkbox" checked={props.advanced.worktree} onChange={(event) => props.onAdvanced("worktree", event.currentTarget.checked)} /><span />New Git worktree</label>
            <label class="settings-switch"><input type="checkbox" checked={props.advanced.forkSession} onChange={(event) => props.onAdvanced("forkSession", event.currentTarget.checked)} /><span />Fork resumed session</label>
            <label class="settings-switch settings-switch--warning"><input type="checkbox" checked={props.advanced.restoreCode} onChange={(event) => props.onAdvanced("restoreCode", event.currentTarget.checked)} /><span />Restore original session code</label>
          </div>
        </div>
      </Show>

      <Show when={showCard("Advanced prompt and session input", "prompt file json uuid plan")}>
        <div class="settings-card">
          <div><strong>Advanced prompt and session input</strong><span>Prompt files, JSON content blocks, session UUIDs, and plan control.</span></div>
          <div class="advanced-settings-grid">
            <label>Prompt file<input value={props.advanced.promptFile} onInput={(event) => props.onAdvanced("promptFile", event.currentTarget.value)} placeholder="workspace prompt file path" /></label>
            <label>New or forked session UUID<input value={props.advanced.sessionId} onInput={(event) => props.onAdvanced("sessionId", event.currentTarget.value)} placeholder="optional UUID" /></label>
            <label>Prompt JSON content blocks<textarea value={props.advanced.promptJson} onInput={(event) => props.onAdvanced("promptJson", event.currentTarget.value)} placeholder='[{"type":"text","text":"Task"}]' /></label>
            <label class="settings-switch"><input type="checkbox" checked={props.advanced.noPlan} onChange={(event) => props.onAdvanced("noPlan", event.currentTarget.checked)} /><span />Disable plan mode (<code>--no-plan</code>)</label>
          </div>
        </div>
      </Show>

      <Show when={showCard("Grok backend toolbox", "mcp plugin sessions dashboard doctor du models version")}>
        <div class="settings-card">
          <div><strong>Grok backend toolbox</strong><span>Live command catalog from the installed Grok Build CLI; safe presets remain available when the CLI is offline.</span></div>
          <div class="backend-tool-presets">
            <For each={props.backendCommands.length ? props.backendCommands.map((entry) => entry.name) : ["inspect --json", "doctor --json", "du --json", "models", "version", "mcp list", "sessions list", "worktree list", "memory --help", "trace --help", "export --help", "completions --help", "setup --json", "dashboard"]}>{(command) =>
              <button onClick={() => props.onRunBackendTool(props.backendCommands.length ? safeToolCommand(command) : command)}>{command}</button>
            }</For>
          </div>
          <Show when={props.backendCommands.length}><div class="provider-notice">Detected: {props.backendCommands.map((entry) => `${entry.name} — ${entry.description}`).join(" · ")}</div></Show>
          <div class="token-row">
            <input value={props.backendToolCommand} onInput={(event) => props.onBackendToolCommand(event.currentTarget.value)} onKeyDown={(event) => { if (event.key === "Enter") props.onRunBackendTool() }} placeholder="mcp list, plugin install URL, sessions search term…" />
            <button class="primary" disabled={props.backendToolRunning || !props.backendToolCommand.trim()} onClick={() => props.onRunBackendTool()}>{props.backendToolRunning ? "Running…" : "Run Grok tool"}</button>
          </div>
          <Show when={props.backendToolOutput}><pre class="runtime-json backend-tool-output">{props.backendToolOutput}</pre></Show>
        </div>
      </Show>

      <Show when={showCard("Native subagents", "delegation")}>
        <div class="settings-card">
          <div><strong>Native subagents</strong><span>Delegate independent work through Grok Build’s own subagent runtime.</span></div>
          <div class="agent-defaults-grid">
            <label class="settings-switch"><input type="checkbox" checked={props.subagentsEnabled} onChange={(event) => props.onSubagents(event.currentTarget.checked)} /><span />Enable subagents</label>
            <label>Delegation style
              <select value={props.delegationMode} disabled={!props.subagentsEnabled} onChange={(event) => props.onDelegationMode(event.currentTarget.value as "balanced" | "aggressive")}>
                <option value="balanced">Balanced</option>
                <option value="aggressive">Proactive parallel</option>
              </select>
            </label>
          </div>
        </div>
      </Show>

      <Show when={showCard("Automatic learning", "skills review")}>
        <div class="settings-card">
          <div><strong>Automatic learning</strong><span>Background skill review after completed coding turns.</span></div>
          <div class="agent-defaults-grid">
            <label class="settings-switch settings-switch--warning"><input type="checkbox" checked={props.autoLearnEnabled} onChange={(event) => props.onAutoLearnEnabled(event.currentTarget.checked)} /><span />Enable auto-learn</label>
            <label>Review interval
              <input type="number" min="1" max="50" value={props.autoLearnInterval} onInput={(event) => props.onAutoLearnInterval(Math.min(50, Math.max(1, Number(event.currentTarget.value) || 10)))} />
              <small>Completed coding turns</small>
            </label>
            <label>Review model
              <GroupedModelSelect value={props.autoLearnModel} emptyLabel="Current/default model" options={props.modelOptions} onChange={props.onAutoLearnModel} />
            </label>
          </div>
          <p class="provider-notice">{props.autoLearnStatus}. Disabled by default because reviews consume model usage and write project skills automatically.</p>
        </div>
      </Show>

      <Show when={showCard("Live coding preview", "iframe url")}>
        <div class="settings-card">
          <div><strong>Live coding preview</strong><span>Optional right rail while chatting.</span></div>
          <div class="preview-setting">
            <label class="settings-switch"><input type="checkbox" checked={props.previewEnabled} onChange={(event) => props.onPreviewEnabled(event.currentTarget.checked)} /><span />Enable preview</label>
            <input value={props.previewDraft} onInput={(event) => props.onPreviewDraft(event.currentTarget.value)} placeholder="http://localhost:3000" />
            <button onClick={() => props.onSavePreview()}>Save URL</button>
          </div>
        </div>
      </Show>

      <Show when={showCard("Agent app controls", "preview vision")}>
        <div class="settings-card">
          <div><strong>Agent app controls</strong><span>Typed actions plus live preview vision.</span></div>
          <label class="settings-switch settings-switch--warning"><input type="checkbox" checked={props.agentAppControls} onChange={(event) => props.onAgentAppControls(event.currentTarget.checked)} /><span />Allow safe app controls</label>
          <p class="provider-notice">The agent cannot click arbitrary UI, access credentials, or expand its permissions.</p>
        </div>
      </Show>
    </Show>
  </PageShell>
}
