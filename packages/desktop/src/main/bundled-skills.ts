import { existsSync } from "fs"
import { cp, mkdir, readFile, writeFile } from "fs/promises"
import { homedir } from "os"
import { join } from "path"
import { app } from "electron"

const SKILL_NAMES = ["search-providers", "browser-automation", "desktop-control-lobster", "source-verification", "tool-discovery"]

/** Install only our marked skills; never overwrite a user-created skill. */
export async function installBundledSkills(): Promise<number> {
  const packaged = join(process.resourcesPath, "grok-skills")
  const development = join(app.getAppPath(), "resources", "grok-skills")
  const sourceRoot = existsSync(packaged) ? packaged : development
  const targetRoot = join(homedir(), ".grok", "skills")
  let installed = 0
  for (const name of SKILL_NAMES) {
    const source = join(sourceRoot, name)
    const target = join(targetRoot, name)
    if (!existsSync(join(source, "SKILL.md"))) continue
    const sourceText = await readFile(join(source, "SKILL.md"), "utf8")
    const targetPath = join(target, "SKILL.md")
    const existing = existsSync(targetPath) ? await readFile(targetPath, "utf8") : ""
    if (existing && !existing.includes("GROK_BUILD_DESKTOP_BUNDLED_SKILL")) continue
    if (existing === sourceText) continue
    await mkdir(targetRoot, { recursive: true })
    await cp(source, target, { recursive: true, force: true })
    await writeFile(targetPath, sourceText, { mode: 0o600 })
    installed += 1
  }
  return installed
}
