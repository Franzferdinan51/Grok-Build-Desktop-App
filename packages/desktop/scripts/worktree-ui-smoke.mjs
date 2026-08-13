import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { promisify } from "node:util"
import { _electron as electron } from "playwright"

const run = promisify(execFile)
const root = await mkdtemp(join(tmpdir(), "grok-worktree-ui-") )
const profile = join(root, "profile")
const repo = join(profile, "Scratch")
await mkdir(repo, { recursive: true })
await run("git", ["init", "-q"], { cwd: repo })
await run("git", ["config", "user.email", "qa@example.com"], { cwd: repo })
await run("git", ["config", "user.name", "Grok UI QA"], { cwd: repo })
await writeFile(join(repo, "README.md"), "worktree UI fixture\n")
await run("git", ["add", "README.md"], { cwd: repo })
await run("git", ["commit", "-qm", "qa fixture"], { cwd: repo })

const app = await electron.launch({
  args: [`--user-data-dir=${profile}`, resolve("out/main/index.js")],
  env: { ...process.env, GROK_BUILD_UI_SMOKE: "1", ELECTRON_RENDERER_URL: "" },
})

try {
  const page = await app.firstWindow()
  await page.locator(".chat-header").waitFor({ state: "visible", timeout: 30_000 })
  const worktrees = page.locator('button[title="Show linked Git worktrees"]')
  await worktrees.waitFor({ state: "visible" })
  await worktrees.click()
  await page.getByRole("button", { name: /New worktree/ }).click()
  const dialog = page.getByRole("dialog", { name: "Create Git worktree" })
  assert.equal(await dialog.getByRole("button", { name: "Create worktree" }).isDisabled(), true)
  await dialog.locator('input[placeholder="feature-name"]').fill("qa-ui-flow")
  await dialog.locator('input[placeholder="feature/my-change"]').fill("qa/ui-flow")
  await dialog.getByRole("button", { name: "Create worktree" }).click()
  await page.locator(".coding-status-row__branch").filter({ hasText: "qa/ui-flow" }).waitFor({ state: "visible", timeout: 30_000 })
  const { stdout } = await run("git", ["worktree", "list", "--porcelain"], { cwd: repo })
  assert.match(stdout, /qa\/ui-flow/)
  assert.match(stdout, /\.worktrees[\\/]qa-ui-flow/)
  assert.equal(await page.getByRole("dialog", { name: "Create Git worktree" }).count(), 0)

  const [project] = await page.evaluate(() => window.api.projects.list())
  assert.ok(project?.path, "the fixture project should be registered")
  const thread = {
    id: "qa-transcript-window",
    workspace: project.path,
    title: "Transcript window fixture",
    createdAt: Date.now() - 85_000,
    updatedAt: Date.now(),
    messages: Array.from({ length: 85 }, (_, index) => ({
      id: `qa-message-${index}`,
      role: index % 2 ? "assistant" : "user",
      logs: [{ kind: "text", content: `Transcript fixture message ${index}` }],
      createdAt: Date.now() - (85 - index) * 1000,
    })),
    sessionId: "",
    sessionStatus: "new",
  }
  await page.evaluate(async ({ root, fixture }) => {
    await window.api.conversations.save(fixture)
    await window.api.store.set(`chat.active.${encodeURIComponent(root)}`, fixture.id)
    await window.api.store.set(`terminal.state.${encodeURIComponent(root)}`, { output: "Persisted terminal fixture\n", history: ["pnpm test", "git status"] })
  }, { root: project.path, fixture: thread })
  await page.reload()
  await page.locator(".chat-header").waitFor({ state: "visible", timeout: 30_000 })
  await page.locator('button[title="Open workspace terminal"]').click()
  await page.getByText("Persisted terminal fixture", { exact: true }).waitFor({ state: "visible" })
  const terminalInput = page.getByRole("textbox", { name: "Workspace terminal command" })
  await terminalInput.press("ArrowUp")
  assert.equal(await terminalInput.inputValue(), "pnpm test")
  await page.locator('button[title="Open workspace terminal"]').click()
  await page.getByText("Recent chats", { exact: true }).waitFor({ state: "visible" })
  const recentSearch = page.locator('input[aria-label="Search recent chats"]')
  await recentSearch.fill("Transcript window")
  await page.getByRole("button", { name: /Transcript window fixture/ }).waitFor({ state: "visible" })
  await recentSearch.fill("")
  const earlier = page.getByRole("button", { name: /Show 40 earlier messages/ })
  await earlier.waitFor({ state: "visible", timeout: 30_000 })
  assert.equal(await page.locator(".chat-message").count(), 40)
  await earlier.click()
  await page.getByRole("button", { name: /Show 5 earlier messages/ }).waitFor({ state: "visible" })
  assert.equal(await page.locator(".chat-message").count(), 80)
  await page.locator('button[title="Inspect current task"]').click()
  await page.getByText("Prepared context", { exact: true }).waitFor({ state: "visible" })
  await page.getByText("bounded app budget", { exact: true }).waitFor({ state: "visible" })
  console.log("Desktop UI smoke passed: isolated worktree dialog + recent-session rail + persistent terminal + paged long transcript")
} finally {
  await app.close()
  await rm(root, { recursive: true, force: true })
}
