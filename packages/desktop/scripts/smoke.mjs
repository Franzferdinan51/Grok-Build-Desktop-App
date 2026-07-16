import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { splitThinking } from "../src/renderer/chat-utils.ts"
import { gitChangedFiles, gitFileDiff, listWorkspaceFiles, readWorkspaceFile, runWorkspaceCommand, writeWorkspaceFile } from "../src/main/workspace-tools.ts"
import { inspectProject } from "../src/main/project-inspection.ts"
import { PreviewServer } from "../src/main/preview-server.ts"

const root = await mkdtemp(join(tmpdir(), "grok-build-desktop-smoke-"))
await writeFile(join(root, "hello.txt"), "hello\n")
await mkdir(join(root, "node_modules"))
await writeFile(join(root, "node_modules", "ignored.js"), "ignored")
await symlink("/etc/passwd", join(root, "escape"))

assert.deepEqual((await listWorkspaceFiles(root)).map((file) => file.path), ["hello.txt"])
await writeWorkspaceFile(root, "hello.txt", "updated\n")
assert.equal(await readWorkspaceFile(root, "hello.txt"), "updated\n")
await assert.rejects(readWorkspaceFile(root, "../outside"), /escapes the workspace/)
assert.equal((await runWorkspaceCommand(root, "pwd")).stdout.trim(), root)

execFileSync("git", ["init", "-q"], { cwd: root })
execFileSync("git", ["add", "hello.txt"], { cwd: root })
execFileSync("git", ["-c", "user.name=Smoke", "-c", "user.email=smoke@example.invalid", "commit", "-qm", "initial"], { cwd: root })
await writeFile(join(root, "hello.txt"), "changed\n")
assert.equal((await gitChangedFiles(root))[0]?.path, "hello.txt")
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

assert.match(execFileSync("grok", ["--version"], { encoding: "utf8" }), /^grok /)
assert.match(execFileSync("grok", ["models"], { encoding: "utf8" }), /Available models:/)
console.log("Smoke test passed: CLI, chat parsing, workspace, preview, containment, terminal, and Git review")
