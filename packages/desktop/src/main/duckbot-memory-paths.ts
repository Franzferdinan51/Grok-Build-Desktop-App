import { existsSync } from "fs"
import { join } from "path"

export function memoryPythonCandidates(repo: string, platform: NodeJS.Platform = process.platform): string[] {
  return platform === "win32"
    ? [join(repo, ".venv", "Scripts", "python.exe"), join(repo, ".venv", "Scripts", "python")]
    : [join(repo, ".venv", "bin", "python"), join(repo, ".venv", "bin", "python3")]
}

export function memoryPythonPath(repo: string, platform: NodeJS.Platform = process.platform): string | undefined {
  return memoryPythonCandidates(repo, platform).find((candidate) => existsSync(candidate))
}
