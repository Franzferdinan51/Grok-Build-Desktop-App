import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtemp, mkdir, realpath, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, basename } from "node:path"
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
import { boundedMoaContext, cleanMoaAdvisorOutput, moaReferenceLabel, normalizeMoaReferenceBudget, MAX_MOA_CONTEXT_CHARS } from "../src/main/moa-utils.ts"
import { listGrokSkills } from "../src/main/grok-skills.ts"
import { classifyBackendError, normalizeBackendStderr } from "../src/main/backend-error.ts"
import { StreamingJsonParser, parseStreamLine } from "../src/main/streaming-json.ts"
import { conversationToMarkdown } from "../src/main/conversation-markdown.ts"
import { rankConversationMatches } from "../src/main/conversation-search.ts"
import { enqueuePrompt, dequeuePrompt, parsePromptQueue } from "../src/renderer/prompt-queue.ts"
import { lastUserInstruction, rewindLastTurn } from "../src/renderer/conversation-lifecycle.ts"
import { matchingSlashCommands } from "../src/renderer/slash-commands.ts"
import { buildPaletteItems, filterPaletteItems } from "../src/renderer/command-palette.ts"
import { catalogModelOptions } from "../src/renderer/provider-availability.ts"
import { frameWorkflowPrompt, parseWorkflowName } from "../src/renderer/workflow-presets.ts"
import { summarizeHarnessDoctor } from "../src/renderer/harness-doctor.ts"
import { statSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname } from "node:path"
import { withRunNowPatch } from "../src/main/scheduled-tasks-utils.ts"
import { telegramStatusForRenderer, withDisconnectedState, withForgottenTokenState } from "../src/main/telegram-state.ts"
import { classifyTelegramHttpError, isTelegramControlCommand, telegramBootstrapDecision, telegramPollingDecision, telegramPublicLiveness } from "../src/main/telegram-connection.ts"
import { tokenizeCommandLine, ShellQuoteError } from "../src/main/shell-quote.ts"
import { mergeLogs, LiveEventBuffer, MAX_LIVE_LOG_CHARS, MAX_LIVE_LOG_ENTRIES } from "../src/renderer/event-buffer.ts"
import { parseTelegramCommand, parseTelegramCallback, buildTelegramMenuReply, buildTelegramModelPicker, buildTelegramMoaMenu, buildTelegramMoaReferencePicker, buildTelegramMoaAggregatorPicker, mapMenuCallback, TELEGRAM_HELP_TEXT } from "../src/main/telegram/commands.ts"
import { parseGrokModels } from "../src/main/grok-models.ts"
import { parseGrokSubcommands, parseGrokSubcommandNames } from "../src/main/grok-subcommands.ts"
import { buildHostControlsPromptBlock, buildSearchControlsPromptBlock, resolveHostControls, sanitizeHostHelperPath } from "../src/main/host-control-paths.ts"
import { isSafeExternalUrl } from "../src/shared/url-safety.ts"
import { validateAppAction, validateAppActions } from "../src/main/app-actions.ts"
import { validateAppAction as validateAppActionRenderer } from "../src/renderer/app-actions.ts"
import { buildManagedModelsBlock, spliceManagedModels } from "../src/main/model-config-block.ts"
import { buildBaseArgs, compatibleCliArgs, promptArgsFor, KNOWN_FLAG_NAMES } from "../src/main/grok-args.ts"
import { shouldForwardCodexSseFrame } from "../src/main/codex-oauth-bridge.ts"

const root = await mkdtemp(join(tmpdir(), "grok-build-desktop-smoke-"))
await writeFile(join(root, "hello.txt"), "hello\n")
await mkdir(join(root, "node_modules"))
await writeFile(join(root, "node_modules", "ignored.js"), "ignored")
const symlinkSmoke = process.platform !== "win32"
if (symlinkSmoke) await symlink("/etc/passwd", join(root, "escape"))

assert.deepEqual((await listWorkspaceFiles(root)).map((file) => file.path), ["hello.txt"])
await writeWorkspaceFile(root, "hello.txt", "updated\n")
assert.equal(await readWorkspaceFile(root, "hello.txt"), "updated\n")
await assert.rejects(readWorkspaceFile(root, "../outside"), /escapes the workspace/)
if (symlinkSmoke) {
  await assert.rejects(readWorkspaceFile(root, "escape"), /symbolic link|ENOENT|ENOTDIR/)
  await assert.rejects(writeWorkspaceFile(root, "escape", "blocked"), /symbolic link|ENOENT|ENOTDIR/)
}
assert.equal((await runWorkspaceCommand(root, "pwd")).stdout.trim().split(/[\\/]/).at(-1), basename(await realpath(root)))
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
if (symlinkSmoke) await assert.rejects(writeWorkspaceFile(root, "escape/new.txt", "blocked"), /symbolic link|ENOTDIR|ENOENT/)
const listedPaths = (await listWorkspaceFiles(root)).map((file) => file.path.split("\\").join("/"))
assert.equal(listedPaths.some((path) => path.startsWith("newdir/")), true)
assert.equal(listedPaths.some((path) => path.startsWith("src/")), true)

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
  id: "run-1", cwd: root, prompt: "test", startedAt: interruptedAt - 1_000, status: "interrupted",
  finishedAt: interruptedAt, error: "Outcome unknown: the app closed before this run finished. Review the workspace before resuming.",
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
assert.ok(boundedContext.length <= MAX_MOA_CONTEXT_CHARS + "[Earlier context omitted to keep reference prompts within OS limits.]\n".length)
assert.equal(normalizeMoaReferenceBudget(), 600)
assert.equal(normalizeMoaReferenceBudget(50), 200)
assert.equal(normalizeMoaReferenceBudget(50_000), 2_000)
assert.equal(cleanMoaAdvisorOutput("<think>private chain of thought</think>\nConcrete advice"), "Concrete advice")
assert.equal(cleanMoaAdvisorOutput("Useful advice</think>"), "Useful advice")
// Hermes-style Grok Build reasoning channel markers must not leak into
// the PRIVATE_ADVISORY_DATA block that the aggregator consumes.
assert.equal(cleanMoaAdvisorOutput("<|channel|>analysis hidden reasoning<|channel|>final Visible answer"), "Visible answer")
assert.equal(cleanMoaAdvisorOutput("before<|channel|>analysis\nreasoning\nmore reasoning\n<|channel|>final\nfinal visible"), "before\nfinal visible")
assert.equal(cleanMoaAdvisorOutput("public<|channel|>analysis private without final"), "public")
// Reference labels match the Hermes-rendered thinking chunk shape.
assert.equal(moaReferenceLabel(0, 3, "grok-4.5"), "◇ Reference 1/3 — grok-4.5")
assert.equal(moaReferenceLabel(2, 3, "nemotron-3-ultra-550b"), "◇ Reference 3/3 — nemotron-3-ultra-550b")
// Conversation context budget was bumped so multi-turn histories have room.
assert.equal(MAX_MOA_CONTEXT_CHARS, 16_000)
{
  const huge = "x".repeat(20_000)
  const sliced = boundedMoaContext(huge)
  assert.ok(sliced.length <= MAX_MOA_CONTEXT_CHARS + "[Earlier context omitted to keep reference prompts within OS limits.]\n".length + 100)
  assert.match(sliced, /\[Earlier context omitted/)
}

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

// The ChatGPT Codex stream can include an internal response.metadata SSE
// event that Grok Build's Rust Responses decoder does not understand. The
// local OAuth bridge must remove that event while preserving content events.
assert.equal(shouldForwardCodexSseFrame('event: response.metadata\ndata: {"type":"response.metadata"}'), false)
assert.equal(shouldForwardCodexSseFrame('data: {"type":"response.metadata","id":"internal"}'), false)
assert.equal(shouldForwardCodexSseFrame('event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"hello"}'), true)
assert.equal(shouldForwardCodexSseFrame('data: [DONE]'), true)
// Garbage that looks JSON-ish but isn't must not crash and must pass through.
assert.equal(normalizeBackendStderr("prefix { not json }"), "prefix { not json }")

// Scheduler: "Run now" on a user-paused schedule must NOT silently flip
// enabled back to true. Previously runScheduleNow hard-set `enabled: true`,
// which discarded the user's Pause intent and, after the manual run, caused
// paused repeat tasks to be re-enabled for one tick before the next user
// pause kicked in. The shipped withRunNowPatch only touches nextRunAt.
{
  const pausedRepeat = {
    id: "abc", name: "n", prompt: "p", cwd: "/tmp", runAt: 1000,
    enabled: false, repeatMinutes: 30, nextRunAt: 999_999,
  }
  const bumped = withRunNowPatch(pausedRepeat, 5_000)
  assert.equal(bumped.enabled, false, "Run now must not flip enabled back to true")
  assert.equal(bumped.nextRunAt, 5_000)
  assert.equal(bumped.repeatMinutes, 30, "repeatMinutes must be preserved")
  // Even a one-time task keeps its existing enabled value.
  const oneTime = { ...pausedRepeat, enabled: true, repeatMinutes: undefined }
  const bumpedOnce = withRunNowPatch(oneTime, 9_999)
  assert.equal(bumpedOnce.enabled, true)
  assert.equal(bumpedOnce.nextRunAt, 9_999)
}

// telegramTextChunks must not enter an infinite loop on limit <= 0. The
// shipped code previously hit `Math.min(1000, 0 / 2) = 0` and `split = limit
// = 0`, leaving `remaining` unchanged and eventually tripping
// RangeError: Invalid array length inside Array.push.
assert.doesNotThrow(() => telegramTextChunks("hello world", 0))
assert.equal(telegramTextChunks("hello", 0).join(""), "hello")
assert.equal(telegramTextChunks("hello", 0).every((chunk) => chunk.length <= 0 || chunk.length === 1), true)

// Telegram bridge state: the soft disconnect keeps the encrypted token so
// the user can reconnect without re-entering the BotFather secret.
const persisted = {
  token: "encrypted-blob",
  updateOffset: 1234,
  allowedChatIds: ["100", "200"],
  pendingChatIds: ["300"],
  sessions: { "100": { sessionId: "abc" } },
}
const afterSoft = withDisconnectedState(persisted)
assert.equal(afterSoft.token, "encrypted-blob", "soft disconnect must keep the token")
assert.equal(afterSoft.updateOffset, 0, "soft disconnect must reset the offset")
assert.deepEqual(afterSoft.allowedChatIds, ["100", "200"])
assert.deepEqual(afterSoft.pendingChatIds, ["300"])
assert.deepEqual(afterSoft.sessions, { "100": { sessionId: "abc" } })

// The hard forget (Remove token) MUST drop the encrypted token from disk.
// Previously disconnect() did not, leaving the bot secret on disk after
// the user clicked Remove.
const afterForget = withForgottenTokenState(persisted)
assert.equal(afterForget.token, undefined, "hard forget must remove the encrypted token")
assert.equal("token" in afterForget, false, "hard forget must not preserve a token key at all")
assert.equal(afterForget.updateOffset, 0)
assert.deepEqual(afterForget.allowedChatIds, ["100", "200"])
assert.deepEqual(afterForget.pendingChatIds, ["300"])
assert.deepEqual(afterForget.sessions, { "100": { sessionId: "abc" } })

// Defensive: when previous state has no fields at all, both helpers still
// produce well-formed defaults (no crashes, no undefined-typed shapes).
const emptySoft = withDisconnectedState({})
assert.deepEqual(emptySoft, { allowedChatIds: [], pendingChatIds: [], chatProfiles: {}, autoApproveFirst: false, updateOffset: 0, sessions: {} })
const emptyForget = withForgottenTokenState({})
assert.equal(emptyForget.token, undefined)
assert.deepEqual(emptyForget, { allowedChatIds: [], pendingChatIds: [], chatProfiles: {}, autoApproveFirst: false, updateOffset: 0, sessions: {} })
const afterForgetHome = withForgottenTokenState({ token: "x", homeChatId: "42", requireMention: true })
assert.equal(afterForgetHome.token, undefined)
assert.equal(afterForgetHome.homeChatId, "42")
assert.equal(afterForgetHome.requireMention, true)
assert.equal("token" in telegramStatusForRenderer({ connected: true, token: "secret" }), false)
assert.equal(telegramPollingDecision(classifyTelegramHttpError(409, "Conflict")?.kind, false), "conflict")
assert.equal(telegramPollingDecision(classifyTelegramHttpError(429, "too many")?.kind, false), "backoff")
assert.equal(telegramBootstrapDecision(401, false, "unauthorized"), "pause")
assert.deepEqual(telegramPublicLiveness({ hasToken: true, polling: true, pollReady: false }), { connected: false, polling: false })
assert.equal(isTelegramControlCommand("/cancel"), true)
assert.equal(isTelegramControlCommand("/run x"), false)

// Shell tokenizer for GrokBuildBackend.runTool: the prior regex split
// command lines incorrectly on embedded escapes, empty quoted strings,
// and unmatched quotes. The shipped tokenizer handles each of these.
assert.deepEqual(tokenizeCommandLine("inspect --json"), ["inspect", "--json"])
assert.deepEqual(tokenizeCommandLine("inspect --tag 'v1.0'"), ["inspect", "--tag", "v1.0"])
assert.deepEqual(tokenizeCommandLine('inspect --message "hello world"'), ["inspect", "--message", "hello world"])
// Embedded escapes inside a double-quoted segment — previously the regex
// stopped at the embedded `\"` literal and dropped the rest.
assert.deepEqual(tokenizeCommandLine('inspect --tag "v1.0 \\"beta\\""'), ["inspect", "--tag", 'v1.0 "beta"'])
// Empty quoted strings.
assert.deepEqual(tokenizeCommandLine('inspect --message ""'), ["inspect", "--message", ""])
assert.deepEqual(tokenizeCommandLine("inspect --message ''"), ["inspect", "--message", ""])
// Adjacent quoted segments collapse.
assert.deepEqual(tokenizeCommandLine(`inspect --x 'a'"b"'c'`), ["inspect", "--x", "abc"])
// Backslash escape outside quotes (escapes the next char).
assert.deepEqual(tokenizeCommandLine("inspect --path /tmp/foo\\ bar"), ["inspect", "--path", "/tmp/foo bar"])
// Trailing whitespace, empty input.
assert.deepEqual(tokenizeCommandLine("inspect --json   "), ["inspect", "--json"])
assert.deepEqual(tokenizeCommandLine(""), [])
assert.deepEqual(tokenizeCommandLine("   "), [])
// Errors: each must throw the typed ShellQuoteError with a useful offset.
assert.throws(() => tokenizeCommandLine('inspect --message "unterminated'), ShellQuoteError)
assert.throws(() => tokenizeCommandLine("inspect --message 'unterminated"), ShellQuoteError)
assert.throws(() => tokenizeCommandLine("inspect foo\\"), ShellQuoteError)

// Live event buffer: adjacent entries of the same kind coalesce into one
// row so streamed token chunks merge, and the tail is bounded by the
// shipped MAX_LIVE_LOG_ENTRIES / MAX_LIVE_LOG_CHARS limits.
{
  const merged = mergeLogs([], [{ kind: "text", content: "hello " }, { kind: "text", content: "world" }])
  assert.equal(merged.length, 1)
  assert.equal(merged[0].content, "hello world")
}
{
  const split = mergeLogs([], [{ kind: "text", content: "public " }, { kind: "thought", content: "private" }, { kind: "text", content: "more" }])
  assert.equal(split.length, 3)
  assert.equal(split.map((entry) => entry.kind).join(","), "text,thought,text")
  assert.equal(split[2].content, "more")
}
{
  const oversized = Array.from({ length: 600 }, (_, index) => ({ kind: "text", content: `entry-${index}` }))
  const trimmed = mergeLogs([], oversized)
  assert.ok(trimmed.length <= MAX_LIVE_LOG_ENTRIES, "mergeLogs must respect MAX_LIVE_LOG_ENTRIES")
  // Most-recent entry must survive.
  assert.match(trimmed[trimmed.length - 1].content, /entry-599$/)
}
{
  const huge = [{ kind: "text", content: "x".repeat(MAX_LIVE_LOG_CHARS + 10_000) }]
  const trimmed = mergeLogs([], huge)
  assert.ok(trimmed.length === 1)
  assert.ok(trimmed[0].content.length <= MAX_LIVE_LOG_CHARS)
}
// Empty incoming is a no-op.
assert.deepEqual(mergeLogs([{ kind: "text", content: "kept" }], []), [{ kind: "text", content: "kept" }])

// LiveEventBuffer is the incremental version the renderer uses between
// rAF flushes. The O(1) amortised cost per append matters at high token
// throughput; verify the totals stay bounded across long streams.
{
  const buffer = new LiveEventBuffer()
  buffer.append([{ kind: "text", content: "hello " }])
  buffer.append([{ kind: "text", content: "world" }])
  assert.equal(buffer.snapshot().length, 1, "adjacent same-kind entries must coalesce")
  assert.equal(buffer.snapshot()[0].content, "hello world")
}
{
  const buffer = new LiveEventBuffer()
  const oversized = Array.from({ length: MAX_LIVE_LOG_ENTRIES + 50 }, (_, index) => ({ kind: index % 2 ? "thought" : "text", content: `e${index}` }))
  buffer.append(oversized)
  const snap = buffer.snapshot()
  assert.ok(snap.length <= MAX_LIVE_LOG_ENTRIES, "LiveEventBuffer must respect MAX_LIVE_LOG_ENTRIES")
  // Reasoning is intentionally consolidated into one bounded diagnostic row,
  // so the final raw row is the latest public response while the latest
  // thought token must remain in the consolidated reasoning record.
  const thought = snap.find((entry) => entry.kind === "thought")
  assert.ok(thought, "consolidated reasoning row must survive")
  assert.match(thought.content, /e549$/, "most recent thought must survive")
  assert.match(snap[snap.length - 1].content, /e548$/, "most recent public entry must survive")
}
{
  const buffer = new LiveEventBuffer()
  buffer.append([{ kind: "text", content: "x".repeat(MAX_LIVE_LOG_CHARS + 1_000) }])
  const snap = buffer.snapshot()
  assert.ok(snap.length === 1)
  assert.ok(snap[0].content.length <= MAX_LIVE_LOG_CHARS)
}

// Telegram command parser: every supported prefix round-trips, plain text
// returns null, and the trailing argument is trimmed.
assert.deepEqual(parseTelegramCommand("/run fix the bug"), { name: "run", argument: "fix the bug" })
assert.deepEqual(parseTelegramCommand("/models"), { name: "models", argument: "" })
assert.deepEqual(parseTelegramCommand("/reasoning off"), { name: "reasoning", argument: "off" })
assert.deepEqual(parseTelegramCommand("/status  "), { name: "status", argument: "" })
assert.deepEqual(parseTelegramCommand("hello"), null)
assert.equal(parseTelegramCommand("/"), null)

// Callback parsing: every inline-keyboard prefix classifies cleanly.
assert.deepEqual(parseTelegramCallback("pick_model:2"), { kind: "pick_model", payload: "2" })
assert.deepEqual(parseTelegramCallback("pick_project:0"), { kind: "pick_project_index", payload: "0" })
assert.deepEqual(parseTelegramCallback("pick_project_id:abc"), { kind: "pick_project_id", payload: "abc" })
assert.deepEqual(parseTelegramCallback("pick_project_scratch"), { kind: "pick_project_scratch", payload: "" })
assert.deepEqual(parseTelegramCallback("pick_project_agent"), { kind: "pick_project_agent", payload: "" })
assert.deepEqual(parseTelegramCallback("pick_mode:deep"), { kind: "pick_mode", payload: "deep" })
assert.deepEqual(parseTelegramCallback("moa_toggle"), { kind: "moa_toggle", payload: "" })
assert.deepEqual(parseTelegramCallback("moa_menu"), { kind: "moa_menu", payload: "" })
assert.deepEqual(parseTelegramCallback("moa_refs"), { kind: "moa_refs", payload: "" })
assert.deepEqual(parseTelegramCallback("moa_ref:2"), { kind: "moa_ref", payload: "2" })
assert.deepEqual(parseTelegramCallback("moa_aggregator"), { kind: "moa_aggregator", payload: "" })
assert.deepEqual(parseTelegramCallback("moa_agg:1"), { kind: "moa_agg", payload: "1" })
assert.deepEqual(parseTelegramCallback("moa_preset:deep"), { kind: "moa_preset", payload: "deep" })
assert.deepEqual(parseTelegramCallback("menu:models"), { kind: "menu", payload: "models" })
assert.deepEqual(parseTelegramCallback("approve_task"), { kind: "approve_task", payload: "" })
assert.deepEqual(parseTelegramCallback("deny_task"), { kind: "deny_task", payload: "" })
assert.deepEqual(parseTelegramCommand("/sethome"), { name: "sethome", argument: "" })
assert.equal(parseTelegramCallback("hello"), null)

// Menu mapping: each menu:* callback maps to its slash equivalent.
assert.equal(mapMenuCallback("models"), "/models")
assert.equal(mapMenuCallback("projects"), "/projects")
assert.equal(mapMenuCallback("status"), "/status")
assert.equal(mapMenuCallback("cancel"), "/cancel")
assert.equal(mapMenuCallback("new"), "/new")
assert.equal(mapMenuCallback("queue"), "/queue")
assert.equal(mapMenuCallback("unknown"), null)

// Menu + picker builders: the shipped helpers produce the same shape as
// the inline constants they replaced, so the Telegram inline-keyboard
// contract is preserved byte-for-byte.
{
  const menu = buildTelegramMenuReply()
  assert.equal(menu.text, TELEGRAM_HELP_TEXT)
  assert.equal(menu.buttons.length, 4)
  assert.equal(menu.buttons[0][0].data, "menu:models")
  assert.equal(menu.buttons[0][1].data, "menu:projects")
}
{
  const picker = buildTelegramModelPicker(["a", "b", "c"], "b")
  assert.equal(picker.text, "Choose a direct model\nCurrent: b\nMoA: Off")
  assert.equal(picker.buttons.length, 5)
  assert.equal(picker.buttons[3][0].text, "✓ b")
  assert.equal(picker.buttons[3][0].data, "pick_model:1")
  assert.equal(picker.buttons[0][0].data, "moa_toggle")
  assert.equal(picker.buttons[0][1].data, "moa_menu")
  assert.equal(picker.buttons[1][0].data, "moa_preset:balanced")
  assert.equal(picker.buttons[1][1].data, "moa_preset:deep")
}
// Picker caps at 30 entries (mirrors the prior inline cap).
{
  const many = Array.from({ length: 100 }, (_, i) => `model-${i}`)
  const picker = buildTelegramModelPicker(many, "model-0")
  assert.equal(picker.buttons.length, 32)
  assert.equal(picker.buttons[2][0].data, "pick_model:0")
  assert.equal(picker.buttons[31][0].data, "pick_model:29")
}
{
  const menu = buildTelegramMoaMenu(true, ["a", "b"], "c")
  assert.match(menu.text, /Status: On/)
  assert.equal(menu.buttons[0][0].data, "moa_toggle")
  const references = buildTelegramMoaReferencePicker(["a", "b", "c"], ["a", "c"])
  assert.equal(references.buttons[0][0].text, "✓ a")
  assert.equal(references.buttons[1][0].text, "b")
  assert.equal(references.buttons[2][0].data, "moa_ref:2")
  const aggregator = buildTelegramMoaAggregatorPicker(["a", "b"], "b")
  assert.equal(aggregator.buttons[1][0].text, "✓ b")
  assert.equal(aggregator.buttons[1][0].data, "moa_agg:1")
}

// parseGrokModels: the shipped CLI output format. Default line gets
// `* <id> (default)`, regular lines get `- <id>`. Embedded blank lines
// and prose headers are skipped.
{
  const stdout = `You are logged in with grok.com.

Default model: grok-4.5

Available models:
  - grok-4.5
  - duckbot-v2-qwen-9b-q4_k_m
  * nemotron-3-ultra-550b (default)
  - minimax-m2-7

`
  const catalog = parseGrokModels(stdout)
  assert.equal(catalog.defaultModel, "nemotron-3-ultra-550b")
  assert.deepEqual(catalog.models, ["grok-4.5", "duckbot-v2-qwen-9b-q4_k_m", "nemotron-3-ultra-550b", "minimax-m2-7"])
}
// Robustness: no default line, duplicate model names, blank lines.
{
  const stdout = `Available models:\n  - a\n  - b\n  - a\n\n`
  const catalog = parseGrokModels(stdout)
  assert.equal(catalog.defaultModel, undefined)
  assert.deepEqual(catalog.models, ["a", "b"])
}
// Empty / malformed input must not throw.
{
  const catalog = parseGrokModels("")
  assert.deepEqual(catalog, { defaultModel: undefined, models: [] })
}
// Default-line presence is independent of order.
{
  const stdout = `* zed (default)\n- alpha\n- beta\n`
  const catalog = parseGrokModels(stdout)
  assert.equal(catalog.defaultModel, "zed")
  assert.deepEqual(catalog.models, ["zed", "alpha", "beta"])
}

let liveGrok = false
// parseGrokSubcommands: extract the documented subcommand list from the
// live CLI's --help output. The previously-hardcoded desktop allowlist
// was stale — the CLI ships `agent`, `leader`, `update`, `version`,
// `help`, `wrap` which the desktop was rejecting.
{
  let grokPath = ""
  try { grokPath = execFileSync(process.platform === "win32" ? "where" : "which", ["grok"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() }
  catch { /* CI smoke remains useful when the optional Grok CLI is not installed. */ }
  if (grokPath) {
    liveGrok = true
    const help = execFileSync("grok", ["--help"], { encoding: "utf8" })
    const names = parseGrokSubcommandNames(help)
    // The live CLI ships these and the desktop must accept them.
    for (const expected of ["agent", "mcp", "models", "update", "version", "help", "wrap", "leader", "inspect", "doctor", "du"]) {
      assert.ok(names.includes(expected), `live subcommand list missing ${expected}: ${names.join(", ")}`)
    }
    assert.ok(names.length >= 15, `expected at least 15 documented subcommands, got ${names.length}`)
  }
}
// The parser handles leading blank lines after the `Commands:` header and
// stops at the first non-matching line.
{
  const help = `Usage: foo [OPTIONS]\n\nOptions:\n  -h\n\nCommands:\n\n  alpha      First subcommand\n  beta       Second subcommand\n\nNotes:\n  trailing block that must not be parsed\n`
  const cmds = parseGrokSubcommands(help)
  assert.deepEqual(cmds.map((c) => c.name), ["alpha", "beta"])
  assert.equal(cmds[0].description, "First subcommand")
}
// Empty input / missing Commands block both yield empty arrays, never throw.
assert.equal(parseGrokSubcommands("").length, 0)
assert.equal(parseGrokSubcommands("Usage: foo\nOptions:\n  -h\n").length, 0)

if (liveGrok) {
  assert.match(execFileSync("grok", ["--version"], { encoding: "utf8" }), /^grok /)
  assert.match(execFileSync("grok", ["models"], { encoding: "utf8" }), /Available models:/)
}

// isSafeExternalUrl is the canonical protocol whitelist every shell.openExternal
// caller funnels through. A regression here would let javascript:/data:/file:
// URLs from a hostile renderer reach the OS.
assert.equal(isSafeExternalUrl("https://example.com/"), true)
assert.equal(isSafeExternalUrl("http://localhost:3000/"), true)
assert.equal(isSafeExternalUrl("HTTPS://Example.COM"), true, "scheme comparison must be case-insensitive")
assert.equal(isSafeExternalUrl("javascript:alert(1)"), false)
assert.equal(isSafeExternalUrl("data:text/html,foo"), false)
assert.equal(isSafeExternalUrl("file:///etc/passwd"), false)
assert.equal(isSafeExternalUrl(""), false)
assert.equal(isSafeExternalUrl("   "), false)
assert.equal(isSafeExternalUrl("not a url"), false)
assert.equal(isSafeExternalUrl(42), false)
assert.equal(isSafeExternalUrl(null), false)
// Trimmed values still classify correctly so callers can hand the result
// of String.prototype.trim directly.
assert.equal(isSafeExternalUrl("  https://example.com/  "), true)

// validateAppAction: the agent's <app_action> tag parser. The renderer and
// main share this contract; both must produce the same verdict for every
// shape so a hostile payload cannot slip past one surface but get caught
// by another.
{
  const future = Date.now() + 60_000
  const okSchedule = validateAppAction({ type: "schedule.create", name: "ship", prompt: "deploy it", runAt: future, repeatMinutes: 30 })
  assert.equal(okSchedule.ok, true)
  if (okSchedule.ok) {
    assert.equal(okSchedule.action.type, "schedule.create")
    if (okSchedule.action.type === "schedule.create") {
      assert.equal(okSchedule.action.repeatMinutes, 30)
    }
  }
  // repeatMinutes > 1y is clamped (mirrors the original behaviour).
  const longRepeat = validateAppAction({ type: "schedule.create", name: "x", prompt: "y", runAt: future, repeatMinutes: 5_000_000 })
  assert.equal(longRepeat.ok, true)
  if (longRepeat.ok && longRepeat.action.type === "schedule.create") {
    assert.equal(longRepeat.action.repeatMinutes, 525_600)
  }
  // Truncation surfaces a notice instead of silently dropping characters.
  const truncated = validateAppAction({ type: "schedule.create", name: "n".repeat(200), prompt: "p".repeat(30_000), runAt: future })
  assert.equal(truncated.ok, true)
  assert.match(truncated.notice || "", /truncated/)
  if (truncated.ok && truncated.action.type === "schedule.create") {
    assert.equal(truncated.action.name.length, 120)
    assert.equal(truncated.action.prompt.length, 20_000)
  }
  // Each rejection path must return `ok: false`, never throw.
  assert.equal(validateAppAction(null).ok, false)
  assert.equal(validateAppAction(undefined).ok, false)
  assert.equal(validateAppAction("string").ok, false)
  assert.equal(validateAppAction({ type: "rm -rf /" }).ok, false)
  assert.equal(validateAppAction({ type: "browser.open", url: "" }).ok, false)
  assert.equal(validateAppAction({ type: "browser.open", url: "javascript:alert(1)" }).ok, false)
  assert.equal(validateAppAction({ type: "browser.open", url: "https://safe.example/" }).ok, true)
  assert.equal(validateAppAction({ type: "schedule.create", name: "x", prompt: "y", runAt: -1 }).ok, false)
  assert.equal(validateAppAction({ type: "schedule.create", name: "x", prompt: "y", runAt: "now" }).ok, false)
  assert.equal(validateAppAction({ type: "schedule.create", name: "", prompt: "y", runAt: future }).ok, false)
  assert.equal(validateAppAction({ type: "schedule.create", name: "x", prompt: "", runAt: future }).ok, false)
  assert.equal(validateAppAction({ type: "schedule.create", name: "x", prompt: "y", runAt: Date.now() }).ok, false, "past runAt must reject")
}
// validateAppActions extracts + validates from the response body. A
// single response can carry multiple action tags; each must be validated
// independently.
{
  const future = Date.now() + 60_000
  const body = `<app_action>{"type":"preview.open"}</app_action>\n<app_action>{"type":"browser.open","url":"javascript:alert(1)"}</app_action>\n<app_action>{"type":"schedule.create","name":"ship","prompt":"go","runAt":${future}}</app_action>\n<app_action>{"not really json"}</app_action>`
  const result = validateAppActions(body)
  assert.equal(result.actions.length, 2)
  assert.equal(result.errors.length, 2)
  assert.match(result.errors.join("\n"), /not http\(s\)/)
  assert.match(result.errors.join("\n"), /JSON|position|line/i, "Malformed JSON action must surface a parse error")
}
// Renderer mirror must agree with the main implementation so neither
// surface silently lets a rejected shape through.
{
  const future = Date.now() + 60_000
  const action = { type: "schedule.create", name: "x", prompt: "y", runAt: future }
  assert.deepEqual(validateAppActionRenderer(action), validateAppAction(action))
  assert.deepEqual(validateAppActionRenderer(null), validateAppAction(null))
}

// Managed-models block builder + splicer are the pure helpers behind the
// async writeManagedModels in main/model-secrets.ts. The block layout is
// what Grok Build reads from `~/.grok/config.toml`, so any drift here
// silently breaks the model catalog.
{
  const block = buildManagedModelsBlock(
    [{ id: "lm-studio", label: "LM Studio", envKey: "LM_STUDIO_API_KEY", baseUrl: "http://localhost:1234/v1" }],
    { "lm-studio": { baseUrl: "http://localhost:1234/v1", modelId: "qwen2.5" } },
    null,
  )
  assert.match(block, /# BEGIN GROK BUILD DESKTOP MANAGED PROVIDERS\n/)
  assert.match(block, /# END GROK BUILD DESKTOP MANAGED PROVIDERS/)
  assert.match(block, /\[model\.lm-studio-qwen2-5\]/)
  assert.match(block, /base_url = "http:\/\/localhost:1234\/v1"/)
  assert.match(block, /model = "qwen2.5"/)
  assert.match(block, /env_key = "LM_STUDIO_API_KEY"/)
  assert.doesNotMatch(block, /model_name/)
}
{
  // codexOAuth snapshot emits the responses backend block.
  const block = buildManagedModelsBlock(
    [],
    {},
    { baseUrl: "https://chatgpt.com/backend-api/codex", models: [{ id: "gpt-5", contextWindow: 200000 }] },
  )
  assert.match(block, /\[model\.codex-gpt-5\]/)
  assert.match(block, /api_backend = "responses"/)
  assert.match(block, /context_window = 200000/)
  assert.match(block, /env_key = "GROK_CODEX_OAUTH_BRIDGE_KEY"/)
}
{
  // spliceManagedModels replaces a pre-existing block AND preserves
  // hand-written configuration outside the markers.
  const existing = "# hand-written\n[model.user-typed]\nmodel = \"keep-me\"\n\n" + "# BEGIN GROK BUILD DESKTOP MANAGED PROVIDERS\n[model.stale]\nmodel = \"old\"\n# END GROK BUILD DESKTOP MANAGED PROVIDERS\n"
  const next = spliceManagedModels(existing, "# BEGIN GROK BUILD DESKTOP MANAGED PROVIDERS\n[model.fresh]\nmodel = \"new\"\n# END GROK BUILD DESKTOP MANAGED PROVIDERS")
  assert.match(next, /\[model\.user-typed\]\nmodel = "keep-me"/, "hand-written config outside markers must survive")
  assert.doesNotMatch(next, /\[model\.stale\]/, "old managed block must be removed")
  assert.match(next, /\[model\.fresh\]/, "new managed block must be present")
}
{
  // First-write path: append the block when no markers exist yet.
  const fresh = spliceManagedModels("# only hand config\n", "# BEGIN GROK BUILD DESKTOP MANAGED PROVIDERS\nx\n# END GROK BUILD DESKTOP MANAGED PROVIDERS")
  assert.match(fresh, /# only hand config/)
  assert.match(fresh, /# BEGIN GROK BUILD DESKTOP MANAGED PROVIDERS/)
}

// grok-args.ts builders: every CLI flag the desktop attaches to a
// `grok -p` invocation must round-trip through these helpers so a future
// audit can grep one place. AGENTS.md is strict about "only verified
// Grok Build flags" — these builders are how that gate is enforced.
{
  const baseArgs = buildBaseArgs({
    prompt: "ship it",
    cwd: "/tmp/proj",
    model: "grok-4.5",
    thinking: true,
    autoApprove: true,
    resume: "abc-123",
    bestOfN: 4,
    selfVerify: false,
    maxTurns: 12,
    disableWebSearch: true,
    subagents: false,
    permissionMode: "auto",
    allow: ["edit", "shell"],
    deny: ["delete-user"],
    tools: "Read,Edit",
    disallowedTools: "WebFetch",
    memory: "experimental",
    sandbox: "default",
    rules: "be concise",
    systemPrompt: "you are a coder",
    verbatim: true,
    worktree: true,
    worktreeName: "feat-x",
    worktreeRef: "main",
    noPlan: true,
  }, ["-p", "ship it"])
  // Required flags the desktop unconditionally passes.
  assert.ok(baseArgs.includes("--cwd"))
  assert.ok(baseArgs.includes("--output-format"))
  assert.ok(baseArgs.includes("streaming-json"), "no --json-schema → streaming-json")
  // Propagated booleans and values.
  assert.ok(baseArgs.includes("--model"))
  assert.ok(baseArgs.includes("grok-4.5"))
  assert.ok(baseArgs.includes("--reasoning-effort"))
  assert.ok(baseArgs.includes("high"))
  assert.ok(baseArgs.includes("--always-approve"))
  assert.ok(baseArgs.includes("--resume"))
  assert.ok(baseArgs.includes("abc-123"))
  assert.ok(baseArgs.includes("--best-of-n"))
  assert.ok(baseArgs.includes("4"), "best-of-n is clamped to [2,10]")
  assert.ok(baseArgs.includes("--max-turns"))
  assert.ok(baseArgs.includes("12"))
  assert.ok(baseArgs.includes("--disable-web-search"))
  assert.ok(baseArgs.includes("--no-subagents"))
  assert.ok(baseArgs.includes("--permission-mode"))
  assert.ok(baseArgs.includes("auto"))
  assert.ok(baseArgs.includes("--allow"))
  assert.ok(baseArgs.includes("edit"))
  assert.ok(baseArgs.includes("--deny"))
  assert.ok(baseArgs.includes("delete-user"))
  assert.ok(baseArgs.includes("--tools"))
  assert.ok(baseArgs.includes("Read,Edit"))
  assert.ok(baseArgs.includes("--disallowed-tools"))
  assert.ok(baseArgs.includes("WebFetch"))
  assert.ok(baseArgs.includes("--experimental-memory"))
  assert.ok(baseArgs.includes("--sandbox"))
  assert.ok(baseArgs.includes("default"))
  assert.ok(baseArgs.includes("--rules"))
  assert.ok(baseArgs.includes("be concise"))
  assert.ok(baseArgs.includes("--system-prompt-override"))
  assert.ok(baseArgs.includes("you are a coder"))
  assert.ok(baseArgs.includes("--verbatim"))
  // resume is set so worktree is suppressed; the focused worktree test
  // below exercises the no-resume path.
  // --no-plan is conditional on no `plan` permission-mode (we pass `auto`).
  assert.ok(baseArgs.includes("--no-plan"))
}
// Without `resume`, worktree flags surface. With `resume`, worktree is
// suppressed (Grok Build cannot attach a worktree to an existing session).
{
  const withWorktree = buildBaseArgs({ prompt: "x", cwd: "/p", worktree: true, worktreeName: "feat-x" }, ["-p", "x"])
  assert.ok(withWorktree.includes("--worktree=feat-x"))
  const withResume = buildBaseArgs({ prompt: "x", cwd: "/p", resume: "abc", worktree: true, worktreeName: "feat-x" }, ["-p", "x"])
  assert.ok(!withResume.includes("--worktree=feat-x"), "resume suppresses worktree")
}
// best-of-n is clamped 1→10 and selfVerify wins over --no-subagents.
{
  const args = buildBaseArgs({ prompt: "x", cwd: "/p", selfVerify: true, subagents: false }, ["-p", "x"])
  assert.ok(args.includes("--check"))
  assert.ok(KNOWN_FLAG_NAMES.includes("--check"), "every emitted flag must appear in the canonical flag list")
  assert.ok(KNOWN_FLAG_NAMES.includes("-p"), "the default prompt flag must appear in the canonical flag list")
  assert.ok(!args.includes("--no-subagents"), "--no-subagents must be omitted when --check is set")
  assert.equal(args.indexOf("--check") >= 0, true)
}
// MoA floors permission-mode to `auto` (the only mode the aggregator
// can implement under). User-passed `plan` is preserved so reviews stay
// read-only.
{
  const moa = buildBaseArgs({ prompt: "x", cwd: "/p", moa: { referenceModels: ["m"], aggregatorModel: "m" } }, ["-p", "x"])
  assert.ok(moa.includes("--permission-mode"))
  assert.ok(moa.includes("auto"))
  // MoA also defaults --no-plan unless permissionMode === "plan".
  assert.ok(moa.includes("--no-plan"))
}
{
  const plan = buildBaseArgs({ prompt: "x", cwd: "/p", permissionMode: "plan", noPlan: true }, ["-p", "x"])
  assert.ok(plan.includes("--permission-mode"))
  assert.ok(plan.includes("plan"))
  assert.ok(!plan.includes("--no-plan"), "official plan mode must not emit --no-plan")
  const moaPlan = buildBaseArgs({ prompt: "x", cwd: "/p", permissionMode: "plan", moa: { referenceModels: ["m"] } }, ["-p", "x"])
  assert.ok(moaPlan.includes("plan"))
  assert.ok(!moaPlan.includes("--no-plan"), "MoA preserves plan mode without --no-plan")
}
// promptArgsFor dispatches to the right prefix. Most desktop runs use -p.
{
  assert.deepEqual(promptArgsFor({ prompt: "hello", cwd: "/p" }), ["-p", "hello"])
  assert.deepEqual(promptArgsFor({ prompt: "ignored", cwd: "/p", promptFile: "/tmp/prompt.txt" }), ["--prompt-file", "/tmp/prompt.txt"])
  assert.deepEqual(promptArgsFor({ prompt: "ignored", cwd: "/p", promptJson: '[{"type":"text","text":"x"}]' }), ["--prompt-json", '[{"type":"text","text":"x"}]'])
}
// compatibleCliArgs drops unsupported flags (calling the omit callback)
// and consumes the next token for known value flags.
{
  const omit = []
  const result = compatibleCliArgs(["-p", "hi", "--unknown", "value", "--known", "value-2", "literal"], new Set(["-p", "--known"]), (flag) => omit.push(flag))
  assert.deepEqual(omit, ["--unknown"])
  // --unknown has no entry in FLAGS_WITH_VALUES so the next token ("value")
  // is preserved as a literal. Only flags we know take a value consume
  // the next token, which keeps the safe-mode behaviour: we never guess
  // about an unknown CLI shape.
  assert.deepEqual(result, ["-p", "hi", "value", "--known", "value-2", "literal"])
  // --flag=value form does NOT consume the next token.
  const r2 = compatibleCliArgs(["--unknown=value", "literal"], new Set(), () => {})
  assert.deepEqual(r2, ["literal"])
  assert.equal(r2.length, 1)
  // A known value-flag from FLAGS_WITH_VALUES strips its value when
  // omitted. `--model` is in the registry; unknown lists treat it as
  // missing.
  const r3 = compatibleCliArgs(["--model", "gpt-x", "literal"], new Set(), () => {})
  assert.deepEqual(r3, ["literal"])
}

// Imagine-generated icon and in-app logo must occupy the packager and
// renderer slots the desktop actually loads.
{
  const here = dirname(fileURLToPath(import.meta.url))
  const icon = statSync(join(here, "../resources/icon.png"))
  const icns = statSync(join(here, "../resources/icon.icns"))
  const resourceLogo = statSync(join(here, "../resources/grok-build-logo.png"))
  const rendererLogo = statSync(join(here, "../src/renderer/assets/grok-build-logo.png"))
  assert.ok(icon.size > 20_000, "packager icon.png must be a real image")
  assert.ok(icns.size > 20_000, "packager icon.icns must be a real image")
  assert.ok(resourceLogo.size > 20_000, "resource logo must be a real image")
  assert.ok(rendererLogo.size > 20_000, "renderer logo must be a real image")
}

// Streaming-json parser: split chunks, SSE wrappers, and concatenated
// objects must still become Grok Build events — never a second agent loop.
{
  const parser = new StreamingJsonParser()
  assert.deepEqual(parser.push('{"type":"text","da'), [])
  const events = parser.push('ta":"hello","session_id":"s1"}\n')
  assert.equal(events[0]?.type, "text")
  assert.equal(events[0]?.data, "hello")
  assert.equal(events[0]?.sessionId, "s1")
  const sse = parseStreamLine('data: {"type":"end","session_id":"s1"}')
  assert.equal(sse[0]?.type, "end")
  assert.equal(sse[0]?.sessionId, "s1")
}

// Durable prompt queue and desktop lifecycle helpers.
{
  const queued = enqueuePrompt([], "  retry the parser  ", "q1", 1)
  assert.equal(queued[0]?.text, "retry the parser")
  assert.equal(dequeuePrompt(queued).next?.id, "q1")
  assert.equal(parsePromptQueue([{ id: "q1", text: "ok", createdAt: 1 }])[0]?.text, "ok")
  const messages = [
    { id: "u1", role: "user", createdAt: 1, logs: [{ kind: "text", content: "keep" }] },
    { id: "a1", role: "assistant", createdAt: 2, logs: [{ kind: "text", content: "ok" }] },
    { id: "u2", role: "user", createdAt: 3, logs: [{ kind: "text", content: "retry me" }] },
    { id: "a2", role: "assistant", createdAt: 4, logs: [{ kind: "text", content: "done" }] },
  ]
  assert.equal(lastUserInstruction(messages), "retry me")
  assert.deepEqual(rewindLastTurn(messages).remaining.map((entry) => entry.id), ["u1", "a1"])
  assert.equal(matchingSlashCommands("/ret")[0]?.name, "retry")
  assert.equal(matchingSlashCommands("/exp")[0]?.name, "export")
  const palette = filterPaletteItems(buildPaletteItems({
    commands: [{ name: "retry", description: "Rerun" }],
    views: [{ id: "settings", label: "Settings" }],
    chats: [{ id: "c1", title: "Parser" }],
    models: ["grok-4.5"],
  }), "retry")
  assert.equal(palette[0]?.id, "command:retry")
  const options = catalogModelOptions(["grok-4.5", "codex-gpt-5"], [], "grok-4.5")
  assert.equal(options[0]?.available, true)
  assert.equal(parseWorkflowName("research links"), "research")
  assert.match(frameWorkflowPrompt("code", "fix parser"), /Duck-Agent code workflow/)
  assert.equal(summarizeHarnessDoctor({ available: true, command: "grok", version: "1" }).ok, true)
}

// Ranked search + markdown export stay thought/action-free.
{
  const threads = [
    { id: "hit", title: "Streaming parser", updatedAt: 5, messages: [{ logs: [{ kind: "text", content: "unrelated" }] }] },
    { id: "secret", title: "Notes", updatedAt: 9, messages: [{ logs: [{ kind: "thought", content: "streaming parser secret" }] }] },
  ]
  const ranked = rankConversationMatches(threads, "streaming parser")
  assert.equal(ranked[0]?.id, "hit")
  assert.equal(ranked.some((thread) => thread.id === "secret"), false)
  const markdown = conversationToMarkdown({
    title: "Export",
    workspace: "/tmp/demo",
    updatedAt: Date.parse("2026-08-12T00:00:00.000Z"),
    messages: [{ role: "assistant", logs: [{ kind: "thought", content: "hidden" }, { kind: "text", content: "Visible <app_action>{\"type\":\"preview.open\"}</app_action>" }] }],
  })
  assert.match(markdown, /Visible/)
  assert.doesNotMatch(markdown, /hidden|preview\.open/)
}

// Error classification is shared with grok run history.
{
  const rate = classifyBackendError("HTTP 429 rate limit")
  assert.equal(rate.class, "rate_limit")
  assert.equal(rate.retryable, true)
  const auth = classifyBackendError("unauthorized token")
  assert.equal(auth.class, "authentication")
  assert.equal(auth.retryable, false)
}

// Checkpoints must not store app-action payloads.
{
  const items = Array.from({ length: 12 }, (_, index) => ({
    role: index % 2 ? "assistant" : "user",
    logs: [{ kind: "text", content: `decision ${index} <app_action>{"type":"preview.open"}</app_action>` }],
  }))
  const checkpoint = checkpointFor(items)
  assert.match(checkpoint || "", /decision/)
  assert.doesNotMatch(checkpoint || "", /app_action|preview\.open/)
}

// Host-control helpers must resolve from the current home directory, never a
// hardcoded developer username. Settings and env win; missing helpers stay
// out of the agent prompt.
{
  const home = "/Users/example"
  const browserPath = join(home, ".openclaw", "workspace", "tools", "browser-control.sh")
  const resolved = resolveHostControls({
    home,
    exists: (path) => path === browserPath,
  })
  assert.equal(resolved.browser.path, browserPath)
  assert.equal(resolved.browser.source, "discovered")
  assert.doesNotMatch(resolved.browser.path, /\/Users\/duckets\//)
  const prompt = buildHostControlsPromptBlock(resolved)
  assert.match(prompt, /browser-control\.sh status/)
  assert.doesNotMatch(prompt, /desktop-control\.sh/)
  assert.doesNotMatch(prompt, /\/Users\/duckets\//)
  assert.equal(buildSearchControlsPromptBlock(resolved), "")
  assert.equal(buildHostControlsPromptBlock({ ...resolved, disabled: true }), "")
  assert.throws(() => sanitizeHostHelperPath("/tmp/bad;rm"), /shell metacharacters/)
}

console.log("Smoke test passed: CLI, chat parsing, Telegram keyboards, workspace, preview, containment, terminal, Git review, streaming-json, queue, and search")
