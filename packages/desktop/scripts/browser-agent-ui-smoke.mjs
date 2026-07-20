import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { createServer } from "node:http"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { _electron as electron } from "playwright"

const testPage = `<!doctype html><html><head><title>Browser Agent Test Lab</title></head><body>
  <h1>Browser Agent Test Lab</h1>
  <p id="message">Waiting for page tool</p>
  <label>Name <input id="name" aria-label="Name" /></label>
  <button id="apply" onclick="document.querySelector('#result').textContent = 'Applied: ' + document.querySelector('#name').value">Apply</button>
  <button id="oauth" onclick="window.open('/oauth', 'oauth-test', 'width=480,height=640')">Continue with Google test</button>
  <p id="result">Not applied</p>
  <script>
    Object.defineProperty(document, 'modelContext', { value: {
      async getTools() { return [{ name: 'set-message', description: 'Set the visible status message', inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } }] },
      async executeTool(name, args) { if (name !== 'set-message') throw new Error('Unknown tool'); document.querySelector('#message').textContent = args.text; return { updated: true, text: args.text } }
    }})
  </script>
</body></html>`
const server = createServer((request, response) => {
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" })
  response.end(request.url === "/oauth" ? "<!doctype html><title>OAuth Popup Test</title><h1>OAuth popup opened</h1>" : testPage)
})
await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen))
const addressInfo = server.address()
assert(addressInfo && typeof addressInfo === "object")
const testUrl = `http://127.0.0.1:${addressInfo.port}`

const testProfile = await mkdtemp(join(tmpdir(), "grok-browser-agent-smoke-"))
const app = await electron.launch({
  args: [`--user-data-dir=${testProfile}`, resolve("out/main/index.js")],
  env: { ...process.env, GROK_BUILD_UI_SMOKE: "1" },
})

try {
  const window = await app.firstWindow()
  window.on("console", (message) => console.log(`[renderer:${message.type()}] ${message.text()}`))
  window.on("pageerror", (error) => console.error(`[renderer:error] ${error.message}`))
  await window.locator(".sidebar__item").first().waitFor({ state: "visible", timeout: 30_000 })
  await window.locator(".sidebar__item").filter({ hasText: "Browser Agent" }).click()

  const agentHeader = window.locator(".grok-browser-chat__header")
  await agentHeader.waitFor({ state: "visible" })
  assert.match(await agentHeader.innerText(), /Grok Browser Agent/)
  const modelSelector = window.locator(".grok-browser-model")
  await modelSelector.waitFor({ state: "visible" })
  assert.equal(await modelSelector.getAttribute("aria-label"), "Browser Agent model")
  await window.waitForFunction(() => Array.from(document.querySelectorAll(".grok-browser-model option")).some((option) => option.value === "minimax-m3"), undefined, { timeout: 30_000 })
  await modelSelector.selectOption("minimax-m3")
  assert.equal(await modelSelector.inputValue(), "minimax-m3")
  assert.equal(await window.locator(".embedded-browser webview").count(), 1)

  const composer = window.locator(".grok-browser-composer textarea")
  await composer.fill(`Open ${testUrl}`)
  await window.locator(".grok-browser-composer button", { hasText: "Send" }).click()
  try {
    await window.waitForFunction(() => {
      const view = document.querySelector(".embedded-browser webview")
      const navigated = typeof view?.getURL === "function" && view.getURL().includes("127.0.0.1")
      const agentStoppedWithoutNavigating = !document.querySelector(".grok-browser-composer textarea[disabled]")
        && document.querySelectorAll(".grok-browser-message").length >= 3
      return navigated || agentStoppedWithoutNavigating
    }, undefined, { timeout: 180_000 })
    const currentUrl = await window.locator(".embedded-browser webview").evaluate((view) => typeof view.getURL === "function" ? view.getURL() : "unavailable")
    assert.match(currentUrl, /127\.0\.0\.1/, `Browser Agent stopped before blank-tab navigation: ${await window.locator(".grok-browser-chat__messages").innerText()}`)
  } catch (error) {
    const transcript = await window.locator(".grok-browser-chat__messages").innerText().catch(() => "Browser transcript unavailable")
    const currentUrl = await window.locator(".embedded-browser webview").evaluate((view) => typeof view.getURL === "function" ? view.getURL() : "unavailable").catch(() => "unavailable")
    console.error(`Blank-tab navigation failed at ${currentUrl}\n${transcript}`)
    throw error
  }
  await window.locator(".grok-browser-composer textarea:not([disabled])").waitFor({ state: "visible", timeout: 180_000 })
  await modelSelector.selectOption("minimax-m2-7")
  assert.equal(await modelSelector.inputValue(), "minimax-m2-7")

  const pageTitle = window.locator(".embedded-browser__tab strong")
  await pageTitle.waitFor({ state: "visible" })
  assert.match(await pageTitle.innerText(), /Browser Agent Test Lab/i)

  const popupPromise = app.waitForEvent("window")
  await window.locator(".embedded-browser webview").evaluate(async (view) => view.executeJavaScript("document.querySelector('#oauth').click()"))
  const popup = await popupPromise
  await popup.waitForLoadState("domcontentloaded")
  assert.match(await popup.title(), /OAuth Popup Test/)
  assert.match(await popup.locator("body").innerText(), /OAuth popup opened/)
  await popup.close()

  await composer.fill("Use the page-native set-message tool to set the message to Agent worked. Then type DuckBot into the Name field and click Apply. Verify both visible results before finishing.")
  await window.locator(".grok-browser-composer button", { hasText: "Send" }).click()
  await window.waitForFunction(() => {
    const messages = Array.from(document.querySelectorAll(".grok-browser-message"))
    const hasTask = messages.some((message) => message.textContent?.includes("Agent worked"))
    const finished = !document.querySelector(".grok-browser-message--live") && messages.length >= 3
    return hasTask && finished
  }, undefined, { timeout: 180_000 })
  const guestResult = await window.locator(".embedded-browser webview").evaluate(async (view) => view.executeJavaScript(`({ message: document.querySelector('#message').textContent, result: document.querySelector('#result').textContent })`))
  if (guestResult.message !== "Agent worked" || guestResult.result !== "Applied: DuckBot") {
    console.error(`Agentic interaction did not complete:\n${await window.locator(".grok-browser-chat__messages").innerText()}`)
  }
  assert.deepEqual(guestResult, { message: "Agent worked", result: "Applied: DuckBot" })
  const transcript = await window.locator(".grok-browser-chat__messages").innerText()
  assert.doesNotMatch(transcript, /Browser task failed|already running another task/i)
  await window.screenshot({ path: "/tmp/grok-browser-agent-smoke.png" })
  console.log("Browser Agent UI smoke passed: blank-tab navigation + OAuth popup + WebMCP/type/click/observe loop")
} finally {
  await app.close()
  await new Promise((resolveClose) => server.close(resolveClose))
  await rm(testProfile, { recursive: true, force: true })
}
