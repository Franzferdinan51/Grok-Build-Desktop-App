import { execFile } from "child_process"
import { existsSync } from "fs"
import { promisify } from "util"

const run = promisify(execFile)
const gitOptions = (cwd: string) => ({ cwd, timeout: 1_500, killSignal: "SIGKILL" as const, maxBuffer: 2_000_000 })

export type ProjectRecord = { id: string; name: string; path: string; addedAt: number }
export type ProjectSnapshot = ProjectRecord & { isGit: boolean; branch?: string; changedFiles: number; diffStat?: string }

export async function inspectProject(project: ProjectRecord): Promise<ProjectSnapshot> {
  if (!existsSync(project.path)) return { ...project, isGit: false, changedFiles: 0 }
  try {
    const { stdout: root } = await run("git", ["rev-parse", "--show-toplevel"], gitOptions(project.path))
    const cwd = root.trim() || project.path
    const [{ stdout: branch }, { stdout: porcelain }, { stdout: diffStat }] = await Promise.all([
      run("git", ["branch", "--show-current"], gitOptions(cwd)).catch(() => ({ stdout: "", stderr: "" })),
      run("git", ["status", "--porcelain", "--untracked-files=normal"], gitOptions(cwd)).catch(() => ({ stdout: "", stderr: "" })),
      run("git", ["diff", "--stat"], gitOptions(cwd)).catch(() => ({ stdout: "", stderr: "" })),
    ])
    return { ...project, path: cwd, isGit: true, branch: branch.trim() || "detached", changedFiles: porcelain.split("\n").filter(Boolean).length, diffStat: diffStat.trim() }
  } catch {
    return { ...project, isGit: false, changedFiles: 0 }
  }
}
