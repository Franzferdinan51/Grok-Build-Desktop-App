import assert from "node:assert/strict"
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import { join } from "node:path"
import test from "node:test"
import { memoryPythonCandidates, memoryPythonPath } from "./duckbot-memory-paths.ts"

test("DuckBot memory resolves the Windows virtualenv layout", async () => {
  const root = await mkdtemp(join(os.tmpdir(), "duckbot-memory-path-"))
  try {
    await mkdir(join(root, ".venv", "Scripts"), { recursive: true })
    const python = join(root, ".venv", "Scripts", "python.exe")
    await writeFile(python, "fixture")
    assert.equal(memoryPythonCandidates(root, "win32")[0], python)
    assert.equal(memoryPythonPath(root, "win32"), python)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("DuckBot memory keeps the Unix virtualenv layout", async () => {
  const root = await mkdtemp(join(os.tmpdir(), "duckbot-memory-path-"))
  try {
    await mkdir(join(root, ".venv", "bin"), { recursive: true })
    const python = join(root, ".venv", "bin", "python")
    await writeFile(python, "fixture")
    await chmod(python, 0o755)
    assert.equal(memoryPythonCandidates(root, "darwin")[0], python)
    assert.equal(memoryPythonPath(root, "darwin"), python)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
