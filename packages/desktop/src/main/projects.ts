import { existsSync } from "fs"
import { basename } from "path"
import { execFile } from "child_process"
import { promisify } from "util"
import { getStore } from "./store"

const run = promisify(execFile)

export type ProjectRecord = { id: string; name: string; path: string; addedAt: number }
export type ProjectSnapshot = ProjectRecord & { isGit: boolean; branch?: string; changedFiles: number; diffStat?: string }

export async function inspectProject(project: ProjectRecord): Promise<ProjectSnapshot> {
  if (!existsSync(project.path)) return { ...project, isGit: false, changedFiles: 0 }
  try {
    const [{ stdout: root }, { stdout: branch }, { stdout: porcelain }, { stdout: diffStat }] = await Promise.all([
      run("git", ["rev-parse", "--show-toplevel"], { cwd: project.path }),
      run("git", ["branch", "--show-current"], { cwd: project.path }),
      run("git", ["status", "--porcelain"], { cwd: project.path }),
      run("git", ["diff", "--stat"], { cwd: project.path }),
    ])
    return { ...project, path: root.trim() || project.path, isGit: true, branch: branch.trim() || "detached", changedFiles: porcelain.split("\n").filter(Boolean).length, diffStat: diffStat.trim() }
  } catch { return { ...project, isGit: false, changedFiles: 0 } }
}

export function listProjects(): ProjectRecord[] { return getStore().get("projects") }

export async function addProject(path: string): Promise<ProjectSnapshot> {
  const normalized = path.replace(/\/$/, "")
  if (!existsSync(normalized)) throw new Error("Project folder does not exist")
  const current = listProjects()
  const existing = current.find((project) => project.path === normalized)
  const record = existing ?? { id: crypto.randomUUID(), name: basename(normalized), path: normalized, addedAt: Date.now() }
  if (!existing) getStore().set("projects", [record, ...current])
  return inspectProject(record)
}

export function removeProject(id: string): void { getStore().set("projects", listProjects().filter((project) => project.id !== id)) }
