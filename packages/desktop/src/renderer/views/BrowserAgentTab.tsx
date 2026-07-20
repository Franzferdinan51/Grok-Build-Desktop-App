import { createMemo, createSignal, For, Show, onCleanup } from "solid-js"
import type { WebviewTag } from "electron"
import type { TaskLog } from "../chat-utils"
import { parseBrowserDirective, type BrowserAction } from "../browser-agent-protocol"

type Props = {
  model?: string
  models: string[]
  workspace?: string
  isRunning: () => boolean
  getEvents: () => TaskLog[]
  onRunAgent: (prompt: string, model?: string) => Promise<TaskLog[]>
  onCancelAgent: () => Promise<void>
}

type BrowserControl = {
  selector: string
  tag: string
  type: string
  label: string
  disabled: boolean
}

type BrowserPageState = {
  url: string
  title: string
  text: string
  screenshotPath: string
  viewport: { width: number; height: number }
  scroll: { x: number; y: number; maxY: number }
  controls: BrowserControl[]
  tools: { name: string; description: string; inputSchema: unknown; kind: "native" | "form" }[]
  webMcpAvailable: boolean
}

type BrowserChatEntry = { id: string; role: "user" | "assistant" | "action"; text: string }

const MAX_AGENT_STEPS = 15
const BROWSER_USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
const asUrl = (input: string) => {
  const value = input.trim()
  if (!value) return ""
  return /^https?:\/\//i.test(value) ? value : `https://${value}`
}
const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))

const publicText = (text: string) => text
  .replace(/<browser_action>[\s\S]*?<\/browser_action>/gi, "")
  .replace(/<browser_done>[\s\S]*?<\/browser_done>/gi, "")
  .replace(/<think(?:ing)?[\s\S]*?<\/think(?:ing)?>/gi, "")
  .trim()

const describeAction = (action: BrowserAction) => {
  if (action.type === "navigate") return `Opening ${action.url}`
  if (action.type === "click") return `Clicking ${action.selector}`
  if (action.type === "type") return `Typing into ${action.selector}`
  if (action.type === "hover") return `Hovering over ${action.selector}`
  if (action.type === "select") return `Selecting ${action.value} in ${action.selector}`
  if (action.type === "click_at") return `Clicking at ${action.x}, ${action.y}`
  if (action.type === "scroll") return `Scrolling ${Math.abs(action.pixels)}px ${action.pixels < 0 ? "up" : "down"}`
  if (action.type === "press") return `Pressing ${action.key}${action.selector ? ` in ${action.selector}` : ""}`
  if (action.type === "webmcp") return `Calling WebMCP tool ${action.name}`
  if (action.type === "screenshot") return "Capturing a fresh screenshot"
  if (action.type === "wait") return `Waiting ${Math.min(action.ms, 5_000)}ms`
  return action.type === "back" ? "Going back" : action.type === "forward" ? "Going forward" : "Reloading the page"
}

const pageInspectionScript = `(async () => {
  const selectorFor = (element) => {
    if (element.id) return '#' + CSS.escape(element.id)
    const parts = []
    let current = element
    while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.body) {
      let part = current.tagName.toLowerCase()
      const name = current.getAttribute('name')
      if (name) part += '[name="' + CSS.escape(name) + '"]'
      else {
        const siblings = Array.from(current.parentElement?.children || []).filter((item) => item.tagName === current.tagName)
        if (siblings.length > 1) part += ':nth-of-type(' + (siblings.indexOf(current) + 1) + ')'
      }
      parts.unshift(part)
      current = current.parentElement
    }
    return 'body > ' + parts.join(' > ')
  }
  const controls = Array.from(document.querySelectorAll('a[href],button,input,textarea,select,[role="button"],[contenteditable="true"]'))
    .filter((element) => {
      const style = getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0
    })
    .slice(0, 120)
    .map((element) => ({
      selector: selectorFor(element),
      tag: element.tagName.toLowerCase(),
      type: element.getAttribute('type') || '',
      label: (element.getAttribute('aria-label') || element.getAttribute('placeholder') || element.textContent || element.getAttribute('title') || element.getAttribute('name') || '').trim().replace(/\\s+/g, ' ').slice(0, 100),
      disabled: Boolean(element.disabled || element.getAttribute('aria-disabled') === 'true')
    }))
  const modelContext = document.modelContext
  let nativeTools = []
  if (modelContext && typeof modelContext.getTools === 'function') {
    try {
      const discovered = await modelContext.getTools()
      nativeTools = Array.from(discovered || []).slice(0, 50).map((tool) => ({
        name: String(tool.name || ''),
        description: String(tool.description || ''),
        inputSchema: tool.inputSchema || { type: 'object', properties: {} },
        kind: 'native'
      })).filter((tool) => tool.name)
    } catch {}
  }
  const formTools = Array.from(document.forms).slice(0, 30).map((form, index) => {
    const properties = {}
    const required = []
    for (const field of Array.from(form.elements)) {
      const name = field.name || field.id
      if (!name || !('value' in field) || field.type === 'submit' || field.type === 'button') continue
      const property = { type: field.type === 'number' || field.type === 'range' ? 'number' : field.type === 'checkbox' ? 'boolean' : 'string' }
      if (field.placeholder) property.description = field.placeholder
      if (field.tagName === 'SELECT') property.enum = Array.from(field.options).map((option) => option.value)
      properties[name] = property
      if (field.required) required.push(name)
    }
    return {
      name: 'form-submit-' + index,
      description: (form.getAttribute('aria-label') || form.getAttribute('name') || form.id || 'Submit the visible form').trim(),
      inputSchema: { type: 'object', properties, required },
      kind: 'form'
    }
  })
  return {
    url: location.href,
    title: document.title,
    text: (document.body?.innerText || '').replace(/\\n{3,}/g, '\\n\\n').slice(0, 16000),
    viewport: { width: innerWidth, height: innerHeight },
    scroll: { x: scrollX, y: scrollY, maxY: Math.max(0, document.documentElement.scrollHeight - innerHeight) },
    controls,
    tools: [...nativeTools, ...formTools],
    webMcpAvailable: Boolean(modelContext)
  }
})()`

const buildAgentPrompt = (task: string, page: BrowserPageState, history: string[], step: number) => `You are the Grok Browser Agent inside Grok Build Desktop. You control the live embedded browser shown beside your chat.

USER TASK
${task}

CURRENT PAGE
URL: ${page.url}
Title: ${page.title}
Viewport: ${page.viewport.width}x${page.viewport.height}
Scroll: ${page.scroll.y}/${page.scroll.maxY}
Screenshot: ${page.screenshotPath}

PAGE-NATIVE WEBMCP TOOLS
${page.tools.map((tool) => `- ${tool.name} [${tool.kind}] | ${tool.description || "No description"} | schema: ${JSON.stringify(tool.inputSchema)}`).join("\n") || "- none exposed; use Browser Use fallback actions"}

INTERACTIVE ELEMENTS (use these exact CSS selectors)
${page.controls.map((control) => `- ${control.selector} | ${control.tag}${control.type ? `/${control.type}` : ""} | ${control.label || "unlabelled"}${control.disabled ? " | disabled" : ""}`).join("\n") || "- none detected"}

VISIBLE PAGE TEXT
${page.text}

ACTION HISTORY
${history.join("\n") || "No actions yet."}

This is step ${step} of ${MAX_AGENT_STEPS} in a Browser Use-style plan/action/observe loop. First reason from the current DOM, screenshot path, page-native tools, and action history. Prefer a page-native WebMCP tool when it directly matches the task; otherwise use the universal browser actions. Choose exactly ONE next action. Use only an exact selector listed above. After every action the host will capture a new DOM state and screenshot and ask you to reassess. Do not claim success until the NEW page state proves it. Do not perform purchases, account changes, destructive actions, or send/publish anything unless the user's task explicitly asked for that exact action. Never request or expose passwords, tokens, or payment data.

If the current URL is about:blank, infer a safe initial destination from the user's task and make navigate your first action. You do not need the user to open a page first.

Return exactly one JSON object and nothing else:
{"kind":"action","action":{"type":"navigate","url":"https://example.com"}}
{"kind":"action","action":{"type":"click","selector":"#search"}}
{"kind":"action","action":{"type":"type","selector":"input[name=q]","text":"query"}}
{"kind":"action","action":{"type":"webmcp","name":"tool-name","arguments":{"key":"value"}}}

When the task is verifiably finished, return:
{"kind":"done","summary":"what was accomplished and what the page now shows"}`

export function BrowserAgentTab(props: Props) {
  let browserView: WebviewTag | undefined
  let chatMessagesElement: HTMLDivElement | undefined
  const listeners: Array<[string, EventListener]> = []
  const [url, setUrl] = createSignal("")
  const [pageTitle, setPageTitle] = createSignal("New tab")
  const [pageUrl, setPageUrl] = createSignal("about:blank")
  const [pageLoading, setPageLoading] = createSignal(false)
  const [canGoBack, setCanGoBack] = createSignal(false)
  const [canGoForward, setCanGoForward] = createSignal(false)
  const [task, setTask] = createSignal("")
  const [working, setWorking] = createSignal(false)
  const [stopRequested, setStopRequested] = createSignal(false)
  const [agentStep, setAgentStep] = createSignal(0)
  const [lastPage, setLastPage] = createSignal<BrowserPageState>()
  const [agentWidth, setAgentWidth] = createSignal(380)
  const [agentModel, setAgentModel] = createSignal(window.localStorage.getItem("grok-browser-agent-model") || props.model || "")
  const availableModels = createMemo(() => [...new Set([agentModel(), props.model || "", ...props.models].filter(Boolean))])
  const [chat, setChat] = createSignal<BrowserChatEntry[]>([
    { id: crypto.randomUUID(), role: "assistant", text: "I’m Grok Browser Agent. Tell me where to go or what to do—I can start from this blank tab and control the live browser beside the chat." },
  ])

  const liveOutput = createMemo(() => props.getEvents()
    .filter((entry) => entry.kind !== "thought")
    .map((entry) => entry.content)
    .join("")
    .trim())

  const appendChat = (role: BrowserChatEntry["role"], text: string) => {
    if (!text.trim()) return
    setChat((entries) => [...entries, { id: crypto.randomUUID(), role, text: text.trim() }])
    queueMicrotask(() => { if (chatMessagesElement) chatMessagesElement.scrollTop = chatMessagesElement.scrollHeight })
  }

  const refreshBrowserChrome = () => {
    if (!browserView) return
    if (typeof browserView.getURL === "function") {
      const next = browserView.getURL() || "about:blank"
      setPageUrl(next)
      if (next !== "about:blank" || !url().trim()) setUrl(next === "about:blank" ? "" : next)
    }
    if (typeof browserView.getTitle === "function") setPageTitle(browserView.getTitle() || "Untitled page")
    setCanGoBack(typeof browserView.canGoBack === "function" && browserView.canGoBack())
    setCanGoForward(typeof browserView.canGoForward === "function" && browserView.canGoForward())
  }

  const bindWebview = (element: WebviewTag) => {
    browserView = element
    const on = (name: string, handler: EventListener) => {
      element.addEventListener(name, handler)
      listeners.push([name, handler])
    }
    on("did-start-loading", () => setPageLoading(true))
    on("did-stop-loading", () => {
      setPageLoading(false)
      refreshBrowserChrome()
    })
    on("did-navigate", (event) => {
      const next = (event as Event & { url?: string }).url
      if (next) { setPageUrl(next); setUrl(next) }
      refreshBrowserChrome()
    })
    on("page-title-updated", (event) => {
      const title = (event as Event & { title?: string }).title
      if (title) setPageTitle(title)
    })
  }

  onCleanup(() => {
    if (!browserView) return
    for (const [name, handler] of listeners) browserView.removeEventListener(name, handler)
  })

  const navigate = async (requested = url()) => {
    const target = asUrl(requested)
    if (!browserView || !/^https?:\/\//i.test(target)) return
    setUrl(target)
    await browserView.loadURL(target)
  }

  const inspectPage = async (): Promise<BrowserPageState> => {
    if (!browserView) throw new Error("The embedded browser is not ready.")
    const inspected = await browserView.executeJavaScript(pageInspectionScript, true) as Omit<BrowserPageState, "screenshotPath">
    let screenshotPath = ""
    if (typeof browserView.capturePage === "function") {
      const image = await browserView.capturePage()
      screenshotPath = await window.api.browserAgent.saveScreenshot(image.toDataURL())
    }
    const state: BrowserPageState = { ...inspected, screenshotPath }
    setPageUrl(state.url)
    setPageTitle(state.title || state.url)
    setUrl(state.url === "about:blank" ? "" : state.url)
    setLastPage(state)
    return state
  }

  const executeAction = async (action: BrowserAction): Promise<{ ok: boolean; detail: string }> => {
    if (!browserView) return { ok: false, detail: "Embedded browser unavailable" }
    try {
      if (action.type === "navigate") {
        if (!/^https?:\/\//i.test(action.url)) return { ok: false, detail: "Only http(s) URLs are allowed" }
        await browserView.loadURL(action.url)
        await wait(650)
      } else if (action.type === "click") {
        const selector = JSON.stringify(action.selector)
        const result = await browserView.executeJavaScript(`(() => { const element = document.querySelector(${selector}); if (!element) return { ok: false, error: 'Element not found' }; element.scrollIntoView({ block: 'center' }); element.click(); return { ok: true }; })()`, true) as { ok: boolean; error?: string }
        if (!result.ok) return { ok: false, detail: result.error || "Click failed" }
        await wait(800)
      } else if (action.type === "type") {
        const selector = JSON.stringify(action.selector)
        const value = JSON.stringify(action.text)
        const result = await browserView.executeJavaScript(`(() => { const element = document.querySelector(${selector}); if (!element) return { ok: false, error: 'Input not found' }; element.focus(); if ('value' in element) element.value = ${value}; else element.textContent = ${value}; element.dispatchEvent(new Event('input', { bubbles: true })); element.dispatchEvent(new Event('change', { bubbles: true })); return { ok: true }; })()`, true) as { ok: boolean; error?: string }
        if (!result.ok) return { ok: false, detail: result.error || "Typing failed" }
        await wait(250)
      } else if (action.type === "hover") {
        const selector = JSON.stringify(action.selector)
        const result = await browserView.executeJavaScript(`(() => { const element = document.querySelector(${selector}); if (!element) return { ok: false, error: 'Element not found' }; element.scrollIntoView({ block: 'center' }); element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); element.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true })); return { ok: true }; })()`, true) as { ok: boolean; error?: string }
        if (!result.ok) return { ok: false, detail: result.error || "Hover failed" }
        await wait(350)
      } else if (action.type === "select") {
        const selector = JSON.stringify(action.selector)
        const value = JSON.stringify(action.value)
        const result = await browserView.executeJavaScript(`(() => { const element = document.querySelector(${selector}); if (!(element instanceof HTMLSelectElement)) return { ok: false, error: 'Select not found' }; element.value = ${value}; element.dispatchEvent(new Event('input', { bubbles: true })); element.dispatchEvent(new Event('change', { bubbles: true })); return { ok: true, value: element.value }; })()`, true) as { ok: boolean; error?: string }
        if (!result.ok) return { ok: false, detail: result.error || "Select failed" }
        await wait(350)
      } else if (action.type === "click_at") {
        const x = Math.max(0, Math.min(10_000, action.x))
        const y = Math.max(0, Math.min(10_000, action.y))
        await browserView.sendInputEvent({ type: "mouseDown", x, y, button: "left", clickCount: 1 })
        await browserView.sendInputEvent({ type: "mouseUp", x, y, button: "left", clickCount: 1 })
        await wait(600)
      } else if (action.type === "scroll") {
        const pixels = Math.max(-4000, Math.min(4000, action.pixels))
        await browserView.executeJavaScript(`window.scrollBy({ top: ${pixels}, behavior: 'smooth' })`, true)
        await wait(600)
      } else if (action.type === "press") {
        const selector = JSON.stringify(action.selector || "body")
        const key = JSON.stringify(action.key)
        const result = await browserView.executeJavaScript(`(() => { const element = document.querySelector(${selector}); if (!element) return { ok: false, error: 'Target not found' }; element.focus(); for (const type of ['keydown','keypress','keyup']) element.dispatchEvent(new KeyboardEvent(type, { key: ${key}, code: ${key}, bubbles: true })); if (${key} === 'Enter' && element.form?.requestSubmit) element.form.requestSubmit(); return { ok: true }; })()`, true) as { ok: boolean; error?: string }
        if (!result.ok) return { ok: false, detail: result.error || "Key press failed" }
        await wait(700)
      } else if (action.type === "webmcp") {
        const name = JSON.stringify(action.name)
        const args = JSON.stringify(action.arguments)
        const result = await browserView.executeJavaScript(`(async () => {
          const toolName = ${name}
          const toolArguments = ${args}
          const context = document.modelContext
          if (context && typeof context.executeTool === 'function') {
            try { return { ok: true, result: await context.executeTool(toolName, toolArguments) } }
            catch (error) { return { ok: false, error: String(error) } }
          }
          const match = toolName.match(/^form-submit-(\\d+)$/)
          const form = match ? document.forms[Number(match[1])] : undefined
          if (!form) return { ok: false, error: 'WebMCP tool is no longer available' }
          for (const [key, value] of Object.entries(toolArguments)) {
            const field = form.elements.namedItem(key)
            if (!field) continue
            if (field instanceof RadioNodeList) field.value = String(value)
            else if (field.type === 'checkbox') field.checked = Boolean(value)
            else field.value = String(value)
            field.dispatchEvent(new Event('input', { bubbles: true }))
            field.dispatchEvent(new Event('change', { bubbles: true }))
          }
          form.requestSubmit()
          return { ok: true, result: 'Form submitted' }
        })()`, true) as { ok: boolean; error?: string; result?: unknown }
        if (!result.ok) return { ok: false, detail: result.error || "WebMCP call failed" }
        await wait(800)
        return { ok: true, detail: `${describeAction(action)} -> ${JSON.stringify(result.result).slice(0, 1000)}` }
      } else if (action.type === "screenshot") {
        await inspectPage()
      } else if (action.type === "back") {
        if (typeof browserView.canGoBack !== "function" || !browserView.canGoBack()) return { ok: false, detail: "No previous page" }
        browserView.goBack(); await wait(700)
      } else if (action.type === "forward") {
        if (typeof browserView.canGoForward !== "function" || !browserView.canGoForward()) return { ok: false, detail: "No next page" }
        browserView.goForward(); await wait(700)
      } else if (action.type === "reload") {
        browserView.reload(); await wait(700)
      } else if (action.type === "wait") {
        await wait(Math.max(100, Math.min(5_000, action.ms)))
      }
      return { ok: true, detail: describeAction(action) }
    } catch (error) {
      return { ok: false, detail: error instanceof Error ? error.message : String(error) }
    }
  }

  const runBrowserAgent = async (requested = task()) => {
    const userTask = requested.trim()
    if (!userTask || working() || props.isRunning()) return
    if (!browserView || typeof browserView.getURL !== "function") return appendChat("assistant", "The embedded browser is still starting. Try again in a moment.")
    setTask("")
    setWorking(true)
    setStopRequested(false)
    setAgentStep(0)
    appendChat("user", userTask)
    const history: string[] = []
    let planningModel = agentModel() || props.model
    try {
      for (let step = 1; step <= MAX_AGENT_STEPS && !stopRequested(); step += 1) {
        setAgentStep(step)
        const page = await inspectPage()
        const instruction = buildAgentPrompt(userTask, page, history, step)
        let logs = await props.onRunAgent(instruction, planningModel)
        if (stopRequested()) break
        // Thoughts are provider-internal planning and may contain coding-agent
        // narration. Only the schema-constrained public payload is protocol.
        let raw = logs.filter((entry) => entry.kind === "text").map((entry) => entry.content).join("\n").trim()
        let directive = parseBrowserDirective(raw)
        let failure = logs.find((entry) => entry.kind === "error")
        if (!directive) {
          const fallback = ["nemotron-3-ultra-550b", "grok-4.5", ...props.models]
            .find((candidate) => candidate && candidate !== planningModel)
          if (fallback) {
            appendChat("action", `${planningModel || "The selected model"} did not return a browser action. Retrying this step with ${fallback}.`)
            planningModel = fallback
            logs = await props.onRunAgent(instruction, planningModel)
            if (stopRequested()) break
            raw = logs.filter((entry) => entry.kind === "text").map((entry) => entry.content).join("\n").trim()
            directive = parseBrowserDirective(raw)
            failure = logs.find((entry) => entry.kind === "error")
          }
        }
        if (failure && !directive) throw new Error(failure.content)
        const status = publicText(raw)
        if (!directive) {
          appendChat("assistant", status || "I couldn't determine a safe next browser action.")
          break
        }
        if (directive.kind === "done") {
          appendChat("assistant", directive.summary || status || "Task complete.")
          break
        }
        const description = describeAction(directive.action)
        appendChat("action", description)
        const result = await executeAction(directive.action)
        history.push(`${step}. ${description} -> ${result.ok ? "ok" : `failed: ${result.detail}`}`)
        if (!result.ok) appendChat("action", `That action failed: ${result.detail}. I’ll reassess the live page.`)
        if (step === MAX_AGENT_STEPS) appendChat("assistant", "I reached the 15-step safety limit. The browser is still open at its current state; send another instruction to continue.")
      }
      if (stopRequested()) appendChat("assistant", "Stopped. I left the browser exactly where it is.")
    } catch (error) {
      appendChat("assistant", `Browser task failed: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setAgentStep(0)
      setWorking(false)
    }
  }

  const stopAgent = async () => {
    setStopRequested(true)
    await props.onCancelAgent()
  }

  const beginResize = (event: PointerEvent) => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = agentWidth()
    const move = (next: PointerEvent) => setAgentWidth(Math.max(290, Math.min(680, startWidth + next.clientX - startX)))
    const finish = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", finish)
      document.body.style.removeProperty("user-select")
      document.body.style.removeProperty("cursor")
    }
    document.body.style.userSelect = "none"
    document.body.style.cursor = "col-resize"
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", finish, { once: true })
  }

  return <section class="browser-workbench" style={{ "--browser-agent-width": `${agentWidth()}px` }}>
    <aside class="grok-browser-chat">
      <header class="grok-browser-chat__header">
        <div class="grok-browser-avatar">✦</div>
        <div><strong>Grok Browser Agent</strong><span>Browser Use loop · {lastPage()?.tools.length || 0} WebMCP/page tools</span></div>
        <select class="grok-browser-model" aria-label="Browser Agent model" title="Model used for Browser Agent steps" value={agentModel()} disabled={working()} onChange={(event) => {
          const next = event.currentTarget.value
          setAgentModel(next)
          window.localStorage.setItem("grok-browser-agent-model", next)
        }}>
          <Show when={!agentModel()}><option value="">Grok Build default</option></Show>
          <For each={availableModels()}>{(entry) => <option value={entry}>{entry}</option>}</For>
        </select>
        <i class={working() ? "is-working" : ""} />
      </header>
      <div class="grok-browser-chat__messages" ref={chatMessagesElement}>
        <For each={chat()}>{(entry) => <article class={`grok-browser-message grok-browser-message--${entry.role}`}>
          <Show when={entry.role !== "action"}><small>{entry.role === "user" ? "You" : "Grok"}</small></Show>
          <p>{entry.text}</p>
        </article>}</For>
        <Show when={working()}><article class="grok-browser-message grok-browser-message--assistant grok-browser-message--live"><small>Grok · agent step {agentStep() || 1}/{MAX_AGENT_STEPS}</small><p>{liveOutput() || "Observing the DOM, screenshot, and page tools before the next action…"}</p><span><i/><i/><i/></span></article></Show>
      </div>
      <Show when={chat().length === 1}><div class="grok-browser-suggestions">
        <button onClick={() => setTask("Summarize this page")}>Summarize this page</button>
        <button onClick={() => setTask("Find the most important information on this page")}>Find key information</button>
        <button onClick={() => setTask("Scroll down and tell me what is below")}>Scroll and inspect</button>
      </div></Show>
      <div class="grok-browser-composer">
        <textarea value={task()} onInput={(event) => setTask(event.currentTarget.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.isComposing) { event.preventDefault(); void runBrowserAgent() } }} placeholder="Tell Grok what to do in the browser…" disabled={working()} />
        <Show when={working()} fallback={<button class="primary" disabled={!task().trim() || props.isRunning()} onClick={() => void runBrowserAgent()}>Send</button>}>
          <button class="grok-browser-stop" onClick={() => void stopAgent()}>Stop</button>
        </Show>
      </div>
    </aside>

    <div class="browser-workbench__splitter" role="separator" aria-label="Resize Grok Browser Agent chat" aria-orientation="vertical" tabIndex={0} onPointerDown={beginResize} onKeyDown={(event) => {
      if (event.key === "ArrowLeft") setAgentWidth((width) => Math.max(290, width - 24))
      if (event.key === "ArrowRight") setAgentWidth((width) => Math.min(680, width + 24))
    }} />

    <main class="embedded-browser">
      <header class="embedded-browser__tabs"><div class="embedded-browser__tab"><span>🌐</span><strong>{pageTitle()}</strong><button aria-label="Close tab">×</button></div><button class="embedded-browser__new-tab" aria-label="New tab">+</button></header>
      <div class="embedded-browser__toolbar">
        <button disabled={!canGoBack()} onClick={() => { if (typeof browserView?.goBack === "function") browserView.goBack() }} aria-label="Back">←</button>
        <button disabled={!canGoForward()} onClick={() => { if (typeof browserView?.goForward === "function") browserView.goForward() }} aria-label="Forward">→</button>
        <button onClick={() => { if (typeof browserView?.reload === "function") browserView.reload() }} aria-label="Reload">↻</button>
        <div class="embedded-browser__address"><span>{pageLoading() ? "◌" : pageUrl().startsWith("https://") ? "⌁" : "○"}</span><input value={url()} onInput={(event) => setUrl(event.currentTarget.value)} onKeyDown={(event) => { if (event.key === "Enter") void navigate(event.currentTarget.value) }} placeholder="Search or enter a URL" /></div>
        <button onClick={() => void navigate()} disabled={!url().trim()}>Go</button>
      </div>
      <div class="embedded-browser__viewport">
        <webview ref={(element) => bindWebview(element as WebviewTag)} src="about:blank" partition="persist:grok-browser-agent" allowpopups useragent={BROWSER_USER_AGENT} />
        <Show when={pageUrl() === "about:blank"}><div class="embedded-browser__welcome"><span>✦</span><h2>Grok Browser</h2><p>Enter a URL above. The live page opens here, and Grok controls this exact window from the chat on the left.</p></div></Show>
      </div>
      <footer><span>{pageLoading() ? "Loading…" : pageUrl() === "about:blank" ? "Ready—ask Grok to open a site" : pageUrl()}</span><span>Browser Use agent · DOM + screenshot observation · WebMCP tools + universal fallback</span></footer>
    </main>
  </section>
}
