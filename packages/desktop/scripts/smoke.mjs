import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtemp, mkdir, realpath, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ensurePublicCompletion, splitThinking } from "../src/renderer/chat-utils.ts"
import { checkpointFor, visibleConversationContext } from "../src/renderer/chat-context.ts"
import { reconcileInterruptedRuns } from "../src/main/grok-run-utils.ts"
import { removeLegacyCodexBridgeTables } from "../src/main/model-config-utils.ts"
import { gitChangedFiles, gitFileDiff, listWorkspaceFiles, readWorkspaceFile, runWorkspaceCommand, writeWorkspaceFile } from "../src/main/workspace-tools.ts"
import { inspectProject } from "../src/main/project-inspection.ts"
import { PreviewServer } from "../src/main/preview-server.ts"
import { telegramInlineKeyboard } from "../src/main/telegram-format.ts"
import { publicTelegramResponse } from "../src/main/telegram-output.ts"
import { telegramHtml, telegramTextChunks } from "../src/main/telegram-text.ts"
import { telegramTaskNeedsMoa } from "../src/main/telegram-agent-policy.ts"
import { boundedMoaContext, cleanMoaAdvisorOutput, normalizeMoaReferenceBudget } from "../src/main/moa-utils.ts"
import { listGrokSkills } from "../src/main/grok-skills.ts"
import { normalizeBackendStderr } from "../src/main/backend-error.ts"

const root = await mkdtemp(join(tmpdir(), "grok-build-desktop-smoke-"))
await writeFile(join(root, "hello.txt"), "hello\n")
await mkdir(join(root, "node_modules"))
await writeFile(join(root, "node_modules", "ignored.js"), "ignored")
await symlink("/etc/passwd", join(root, "escape"))

assert.deepEqual((await listWorkspaceFiles(root)).map((file) => file.path), ["hello.txt"])
await writeWorkspaceFile(root, "hello.txt", "updated\n")
assert.equal(await readWorkspaceFile(root, "hello.txt"), "updated\n")
await assert.rejects(readWorkspaceFile(root, "../outside"), /escapes the workspace/)
await assert.rejects(readWorkspaceFile(root, "escape"), /symbolic link/)
await assert.rejects(writeWorkspaceFile(root, "escape", "blocked"), /symbolic link/)
assert.equal((await runWorkspaceCommand(root, "pwd")).stdout.trim(), await realpath(root))
// Editors and skill workflows routinely need to write files into brand-new
// subdirectories. Without mkdir-after-validate, writeWorkspaceFile would
// reject those paths even though they are inside the workspace.
await writeWorkspaceFile(root, "newdir/nested/file.txt", "created\n")
assert.equal(await readWorkspaceFile(root, "newdir/nested/file.txt"), "created\n")
// Writing under an *existing* subdirectory into a missing nested path is
// the common React/Vite/Next case (src exists, src/components/Button.tsx
// does not). The walk-up-the-parent-chain fix must accept any realpath'd
// ancestor inside the workspace, not only the workspace root itself.
await mkdir(join(root, "src"))
await writeWorkspaceFile(root, "src/components/Button.tsx", "export const Button = () => null;\n")
assert.equal(await readWorkspaceFile(root, "src/components/Button.tsx"), "export const Button = () => null;\n")
// Symlink escape must still be rejected even when the symlinked target path
// does not yet exist as a real file. The error class depends on whether the
// symlink resolves to a directory (symbolic link) or to a non-directory
// target (ENOTDIR) — both correctly block the write.
await assert.rejects(writeWorkspaceFile(root, "escape/new.txt", "blocked"), /symbolic link|ENOTDIR/)
assert.equal((await listWorkspaceFiles(root)).some((file) => file.path.startsWith("newdir/")), true)
assert.equal((await listWorkspaceFiles(root)).some((file) => file.path.startsWith("src/")), true)

execFileSync("git", ["init", "-q"], { cwd: root })
execFileSync("git", ["add", "hello.txt"], { cwd: root })
execFileSync("git", ["-c", "user.name=Smoke", "-c", "user.email=smoke@example.invalid", "commit", "-qm", "initial"], { cwd: root })
await writeFile(join(root, "hello.txt"), "changed\n")
await writeFile(join(root, "file with spaces.txt"), "untracked\n")
assert.equal((await gitChangedFiles(root))[0]?.path, "hello.txt")
assert.equal((await gitChangedFiles(root)).some((entry) => entry.path === "file with spaces.txt"), true)
assert.match(await gitFileDiff(root, "hello.txt"), /changed/)
const project = await inspectProject({ id: "smoke", name: "smoke", path: root, addedAt: Date.now() })
assert.equal(project.isGit, true)
assert.equal(project.changedFiles >= 1, true)

await writeFile(join(root, "index.html"), "<h1>preview works</h1>")
const preview = new PreviewServer()
const previewAddress = await preview.start(root)
assert.match(await (await fetch(previewAddress.url)).text(), /preview works/)
assert.equal((await fetch(`${previewAddress.url}/escape`)).status, 404)
await preview.stop()

const plainRoot = await mkdtemp(join(tmpdir(), "grok-build-desktop-plain-"))
await writeFile(join(plainRoot, "readme.txt"), "not a repository")
assert.deepEqual(await gitChangedFiles(plainRoot), [])

assert.deepEqual(splitThinking([
  { kind: "text", content: "<thi" },
  { kind: "text", content: "nk>private reasoning</think>Public answer" },
]), [
  { kind: "thought", content: "private reasoning" },
  { kind: "text", content: "Public answer" },
])

// A model that streams an orphan closing reasoning tag without ever sending
// the matching opener must not leak `</think>` into the public chat pane.
assert.deepEqual(splitThinking([
  { kind: "text", content: "Public answer</think>trailing" },
]), [
  { kind: "text", content: "Public answertrailing" },
])
assert.deepEqual(splitThinking([
  { kind: "text", content: "Public answer</think>" },
]), [
  { kind: "text", content: "Public answer" },
])
// A closing tag flushed before the matching opening reasoning tag — common
// when a provider closes a previous thinking block mid-flush and then opens
// a new one — must also be stripped from the public slice that precedes
// the opening tag.
assert.deepEqual(splitThinking([
  { kind: "text", content: "Public</think><think>private</think>answer" },
]), [
  { kind: "text", content: "Public" },
  { kind: "thought", content: "private" },
  { kind: "text", content: "answer" },
])

assert.deepEqual(ensurePublicCompletion([{ kind: "thought", content: "private only" }]), [
  { kind: "thought", content: "private only" },
  { kind: "text", content: "Task completed. Grok Build applied the changes but returned no public summary." },
])
assert.deepEqual(ensurePublicCompletion([{ kind: "text", content: "Public answer" }]), [{ kind: "text", content: "Public answer" }])
const continuation = visibleConversationContext([{ role: "user", logs: [{ kind: "text", content: "keep" }, { kind: "thought", content: "secret" }] }, { role: "assistant", logs: [{ kind: "text", content: "done <app_action>{\"type\":\"preview.open\"}</app_action>" }] }], "checkpoint")
assert.match(continuation, /checkpoint|keep/)
assert.doesNotMatch(continuation, /secret|app_action|preview\.open/)
assert.equal(checkpointFor(Array.from({ length: 12 }, () => ({ role: "user", logs: [{ kind: "text", content: "decision" }] })))?.includes("decision"), true)

const interruptedAt = 1_800_000_000_000
assert.deepEqual(reconcileInterruptedRuns([{
  id: "run-1", cwd: root, prompt: "test", startedAt: interruptedAt - 1_000, status: "running",
}], interruptedAt), [{
  id: "run-1", cwd: root, prompt: "test", startedAt: interruptedAt - 1_000, status: "cancelled",
  finishedAt: interruptedAt, error: "Interrupted because the app closed before this run finished.",
}])

assert.deepEqual(telegramInlineKeyboard({ text: "Models", buttons: [[{ text: "✓ grok-4.5", data: "pick_model:0" }]] }), {
  inline_keyboard: [[{ text: "✓ grok-4.5", callback_data: "pick_model:0" }]],
})
assert.equal(telegramInlineKeyboard({ text: "No buttons", buttons: [] }), undefined)
const telegramChunks = telegramTextChunks(`${"word ".repeat(1000)}tail`)
assert.equal(telegramHtml("**Done** with `code` & <safe>"), "<b>Done</b> with <code>code</code> &amp; &lt;safe&gt;")
// Defense in depth: Telegram's HTML parser already rejects non-http(s)
// href values, but telegramHtml also validates each markdown link target
// with the WHATWG URL parser so future parser regressions or hostile
// model output cannot regress the safety floor.
assert.match(telegramHtml("[ok](https://example.com)"), /<a href="https:\/\/example\.com\/">ok<\/a>/)
assert.equal(telegramHtml("[evil](javascript:alert(1))"), "[evil](javascript:alert(1))")
assert.equal(telegramHtml("[evil](data:text/html,foo)"), "[evil](data:text/html,foo)")
assert.equal(telegramHtml("[evil](file:///etc/passwd)"), "[evil](file:///etc/passwd)")
assert.equal(telegramTaskNeedsMoa("Hello? Just respond"), false)
assert.equal(telegramTaskNeedsMoa("Please fix the Telegram agent and test everything"), true)
assert.ok(telegramChunks.length > 1)
assert.ok(telegramChunks.every((chunk) => chunk.length <= 3900))
assert.equal(telegramChunks.join(" ").replace(/\s+/g, " ").trim(), `${"word ".repeat(1000)}tail`.replace(/\s+/g, " ").trim())
assert.equal(publicTelegramResponse("<think>private reasoning</think>\nPublic answer"), "Public answer")
assert.equal(publicTelegramResponse("<analysis>private\nunfinished"), "")
assert.equal(publicTelegramResponse("Public\n<app_action>{\"type\":\"preview.open\"}</app_action>"), "Public")
assert.equal(publicTelegramResponse("<|channel|>analysis hidden<|channel|>final Visible"), "Visible")
assert.throws(() => telegramInlineKeyboard({ text: "Too long", buttons: [[{ text: "model", data: "x".repeat(65) }]] }), /64 bytes/)

assert.equal(boundedMoaContext(" short context "), "short context")
const oversizedMoaContext = `old-${"x".repeat(20_000)}-latest`
const boundedContext = boundedMoaContext(oversizedMoaContext)
assert.equal(boundedContext.endsWith("-latest"), true)
assert.equal(boundedContext.length < 13_000, true)
assert.equal(normalizeMoaReferenceBudget(), 600)
assert.equal(normalizeMoaReferenceBudget(50), 200)
assert.equal(normalizeMoaReferenceBudget(50_000), 2_000)
assert.equal(cleanMoaAdvisorOutput("<think>private chain of thought</think>\nConcrete advice"), "Concrete advice")
assert.equal(cleanMoaAdvisorOutput("Useful advice</think>"), "Useful advice")

const duplicateCodexConfig = `[model.keep]\nmodel = "keep"\n\n[model.codex-old]\nmodel = "gpt-old"\nenv_key = "GROK_CODEX_OAUTH_BRIDGE_KEY"\n\n# BEGIN GROK BUILD DESKTOP MANAGED PROVIDERS\n[model.codex-new]\nmodel = "gpt-new"\nenv_key = "GROK_CODEX_OAUTH_BRIDGE_KEY"\n# END GROK BUILD DESKTOP MANAGED PROVIDERS\n`
const repairedCodexConfig = removeLegacyCodexBridgeTables(duplicateCodexConfig)
assert.doesNotMatch(repairedCodexConfig, /model\.codex-old/)
assert.match(repairedCodexConfig, /model\.keep/)
assert.match(repairedCodexConfig, /model\.codex-new/)

// Skill discovery: the parser must read both single-line and YAML folded
// `description: >` frontmatter, otherwise shipped skills render as `>` in
// the desktop UI and become invisible to the command palette.
const skillsRoot = await mkdtemp(join(tmpdir(), "grok-build-desktop-skills-"))
await mkdir(join(skillsRoot, ".grok", "skills", "single-line"), { recursive: true })
await writeFile(join(skillsRoot, ".grok", "skills", "single-line", "SKILL.md"), `---
name: single-line
description: A short one-line description.
---
body
`)
await mkdir(join(skillsRoot, ".grok", "skills", "folded"), { recursive: true })
await writeFile(join(skillsRoot, ".grok", "skills", "folded", "SKILL.md"), `---
name: folded
description: >
  A longer multi-line description that spans
  several indented lines until the next key.
metadata:
  short-description: "Folded skill"
---
body
`)
const discovered = listGrokSkills(skillsRoot)
const single = discovered.find((skill) => skill.name === "single-line")
const folded = discovered.find((skill) => skill.name === "folded")
assert.equal(single?.description, "A short one-line description.")
assert.match(folded?.description || "", /^A longer multi-line description/)
assert.match(folded?.description || "", /several indented lines/)

// Backend stderr normalization: when Grok Build prints a JSON "Internal
// error: { ... }" dump on stderr (for example a provider returning null
// token counts that the CLI cannot serialize), the user-visible error
// must be the human-readable `message` rather than the full dump with
// prompt-usage metadata attached.
const stderrDump = `Internal error: {
  "message": "serialization error: invalid type: null, expected u32 at line 1 column 331",
  "promptUsage": {
    "inputTokens": 17493,
    "outputTokens": 127,
    "totalTokens": 17620,
    "cachedReadTokens": 0,
    "reasoningTokens": 0,
    "modelCalls": 1,
    "apiDurationMs": 3493,
    "modelUsage": {
      "nvidia/nemotron-3-ultra-550b-a55b": { "inputTokens": 17493, "outputTokens": 127, "totalTokens": 17620, "cachedReadTokens": 0, "reasoningTokens": 0, "modelCalls": 1, "apiDurationMs": 3493 }
    },
    "numTurns": 1
  }
}`
const normalizedMessage = normalizeBackendStderr(stderrDump)
assert.equal(normalizedMessage, "serialization error: invalid type: null, expected u32 at line 1 column 331")
// The dump must be invisible — prompt-usage keys cannot leak into the chat pane.
assert.doesNotMatch(normalizedMessage, /promptUsage/)
assert.doesNotMatch(normalizedMessage, /numTurns/)
assert.doesNotMatch(normalizedMessage, /modelUsage/)
// Bare JSON `{ "message": ... }` and JSON with an `error` field are both handled.
assert.equal(normalizeBackendStderr("{\"message\":\"hi\"}"), "hi")
assert.equal(normalizeBackendStderr("prefix {\"error\":\"something broke\"}"), "something broke")
// Non-JSON stderr must pass through unchanged so existing error UX is preserved.
assert.equal(normalizeBackendStderr("permission denied for /usr/local/bin/grok"), "permission denied for /usr/local/bin/grok")
// Empty / whitespace-only stderr stays empty.
assert.equal(normalizeBackendStderr(""), "")
assert.equal(normalizeBackendStderr("   \n  "), "")
// Garbage that looks JSON-ish but isn't must not crash and must pass through.
assert.equal(normalizeBackendStderr("prefix { not json }"), "prefix { not json }")

assert.match(execFileSync("grok", ["--version"], { encoding: "utf8" }), /^grok /)
assert.match(execFileSync("grok", ["models"], { encoding: "utf8" }), /Available models:/)
console.log("Smoke test passed: CLI, chat parsing, Telegram keyboards, workspace, preview, containment, terminal, and Git review")
