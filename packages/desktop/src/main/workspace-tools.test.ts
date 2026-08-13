import test from "node:test"
import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { promisify } from "node:util"
import { applyGitFileAction, gitChangedFiles, gitFileDiff } from "./workspace-tools.ts"

const run = promisify(execFile)

test("Git review actions stage, unstage, discard, and read staged diffs", async () => {
  const root = await mkdtemp(`${tmpdir()}/grok-review-`)
  await run("git", ["init", "-q"], { cwd: root })
  await run("git", ["config", "user.email", "test@example.com"], { cwd: root })
  await run("git", ["config", "user.name", "Grok Test"], { cwd: root })
  await writeFile(`${root}/note.txt`, "before\n")
  await run("git", ["add", "note.txt"], { cwd: root })
  await run("git", ["commit", "-qm", "initial"], { cwd: root })
  await writeFile(`${root}/note.txt`, "after\n")

  assert.equal((await gitChangedFiles(root)).find((entry) => entry.path === "note.txt")?.staged, false)
  await applyGitFileAction(root, "note.txt", "stage")
  assert.equal((await gitChangedFiles(root)).find((entry) => entry.path === "note.txt")?.staged, true)
  assert.match(await gitFileDiff(root, "note.txt"), /\+after/)
  await applyGitFileAction(root, "note.txt", "unstage")
  assert.equal((await gitChangedFiles(root)).find((entry) => entry.path === "note.txt")?.staged, false)
  await applyGitFileAction(root, "note.txt", "discard")
  assert.equal(await readFile(`${root}/note.txt`, "utf8"), "before\n")
  assert.deepEqual(await gitChangedFiles(root), [])
})

