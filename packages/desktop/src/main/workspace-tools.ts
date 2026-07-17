import { execFile } from "child_process"
import { promisify } from "util"
import { readdir, readFile, realpath, stat, writeFile } from "fs/promises"
import { dirname, relative, resolve, sep } from "path"

const execFileAsync = promisify(execFile)

// Heavyweight / cache / build directories that never belong in a workspace
// file browser or review tree. Mirrors the Hermes Desktop ALWAYS_EXCLUDED list
// so the file browser stays fast and readable across React Native, Flutter,
// Python, Go, Java, and Elixir projects — not just JS/TS repos.
const ignored = new Set([
  // VCS internals
  ".git", ".hg", ".svn",
  // JS/TS package + build output
  "node_modules", "bower_components", "dist", "build", "out", ".turbo", ".parcel-cache",
  ".next", ".nuxt", ".svelte-kit", ".output",
  // Python virtualenvs and caches
  ".venv", "venv", "env", "__pycache__", ".mypy_cache", ".pytest_cache", ".ruff_cache", ".tox",
  // JVM / mobile / native
  ".gradle", "target", "vendor", "Pods",
  // Editor / IDE state
  ".idea",
  // Infra / deploy cache
  ".terraform", ".expo", ".angular", "coverage",
  // OS noise
  ".DS_Store", "Thumbs.db",
])

async function safePath(root: string, candidate: string): Promise<string> {
  const canonicalRoot = await realpath(root)
  const target = resolve(canonicalRoot, candidate)
  if (target !== canonicalRoot && !target.startsWith(canonicalRoot + sep)) throw new Error("Path escapes the workspace")
  const canonicalTarget = await realpath(target)
  if (canonicalTarget !== canonicalRoot && !canonicalTarget.startsWith(canonicalRoot + sep)) throw new Error("Path escapes the workspace through a symbolic link")
  return canonicalTarget
}

async function safeWritePath(root: string, candidate: string): Promise<string> {
  const canonicalRoot = await realpath(root)
  const target = resolve(canonicalRoot, candidate)
  if (target !== canonicalRoot && !target.startsWith(canonicalRoot + sep)) throw new Error("Path escapes the workspace")
  try { return await safePath(canonicalRoot, candidate) }
  catch (error) {
    const parent = await realpath(dirname(target))
    if (parent !== canonicalRoot && !parent.startsWith(canonicalRoot + sep)) throw new Error("Path escapes the workspace through a symbolic link")
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return target
    throw error
  }
}

export type WorkspaceFile = { path: string; size: number }
export async function listWorkspaceFiles(root: string, limit = 1500): Promise<WorkspaceFile[]> {
  const canonicalRoot = await realpath(root); const output: WorkspaceFile[] = []
  async function walk(directory: string, depth: number): Promise<void> {
    if (output.length >= limit) return
    let entries
    try { entries = await readdir(directory, { withFileTypes: true }) }
    catch { return } // unreadable / permission denied — skip silently like Hermes does
    for (const entry of entries) {
      if (ignored.has(entry.name) || entry.name.startsWith(".DS_")) continue
      const path = resolve(directory, entry.name)
      if (entry.isSymbolicLink()) continue
      if (entry.isDirectory()) {
        // Bound recursion so a deeply nested vendored tree that slipped past
        // the ignore list can't make the first browse of a project slow.
        if (depth < 12) await walk(path, depth + 1)
      }
      else if (entry.isFile()) {
        let info
        try { info = await stat(path) } catch { continue }
        if (info.size <= 2_000_000) output.push({ path: relative(canonicalRoot, path), size: info.size })
      }
      if (output.length >= limit) return
    }
  }
  await walk(canonicalRoot, 0); return output.sort((a, b) => a.path.localeCompare(b.path))
}
export async function readWorkspaceFile(root: string, path: string): Promise<string> { return readFile(await safePath(root, path), "utf8") }
export async function writeWorkspaceFile(root: string, path: string, content: string): Promise<void> { await writeFile(await safeWritePath(root, path), content, "utf8") }
// Strip ANSI color/escape sequences from command output so the terminal pane
// shows clean text instead of raw `\x1b[32m…` artifacts from tools like
// `ls --color`, `pytest`, or `cargo`. Mirrors the cleanup Hermes performs
// before displaying captured subprocess output.
const ANSI_ESCAPE = /\x1b(?:\[[0-9;?]*[ -/]*[@-~]|[@-Z\\-_]|\][^\x07\x1b]*(?:\x07|\x1b\\))/g
function stripAnsi(value: string): string { return value ? value.replace(ANSI_ESCAPE, "") : value }

export async function runWorkspaceCommand(root: string, command: string): Promise<{ stdout: string; stderr: string; code: number }> {
  if (!command.trim()) throw new Error("Command is required")
  const cwd = await realpath(root); const shell = process.env.SHELL || (process.platform === "win32" ? "cmd.exe" : "/bin/sh")
  const args = process.platform === "win32" ? ["/d", "/s", "/c", command] : ["-lc", command]
  try {
    const { stdout, stderr } = await execFileAsync(shell, args, { cwd, timeout: 120_000, maxBuffer: 5_000_000 })
    return { stdout: stripAnsi(stdout), stderr: stripAnsi(stderr), code: 0 }
  }
  catch (error) {
    const failure = error as { stdout?: string; stderr?: string; code?: number }
    return { stdout: stripAnsi(failure.stdout || ""), stderr: stripAnsi(failure.stderr || String(error)), code: typeof failure.code === "number" ? failure.code : 1 }
  }
}

export async function gitChangedFiles(root: string): Promise<{ status: string; path: string }[]> {
  const cwd = await realpath(root)
  let stdout: string
  try { ({ stdout } = await execFileAsync("git", ["status", "--porcelain=v1", "-z", "--untracked-files=normal"], { cwd, timeout: 10_000 })) }
  catch { return [] }
  const records = stdout.split("\0").filter(Boolean)
  const changes: { status: string; path: string }[] = []
  for (let index = 0; index < records.length; index++) {
    const record = records[index]!
    const status = record.slice(0, 2).trim() || "M"
    changes.push({ status, path: record.slice(3) })
    if (/^[RC]/.test(status) || /[RC]$/.test(status)) index++
  }
  return changes
}
export async function gitFileDiff(root: string, path: string): Promise<string> {
  const cwd = await realpath(root); await safePath(cwd, path)
  const status = (await gitChangedFiles(cwd)).find((entry) => entry.path === path)?.status
  if (status === "??") return `--- /dev/null\n+++ b/${path}\n` + (await readWorkspaceFile(cwd, path)).split("\n").map((line) => `+${line}`).join("\n")
  const { stdout } = await execFileAsync("git", ["diff", "--", path], { cwd, timeout: 10_000, maxBuffer: 5_000_000 })
  return stdout || "No unstaged diff. The change may already be staged."
}
