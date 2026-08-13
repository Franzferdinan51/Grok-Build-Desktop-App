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
  console.log("Worktree UI smoke passed: isolated dialog + real Git checkout")
} finally {
  await app.close()
  await rm(root, { recursive: true, force: true })
}
