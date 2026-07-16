import { existsSync } from "fs"
import { basename } from "path"
import { getStore } from "./store"
import { inspectProject, type ProjectRecord, type ProjectSnapshot } from "./project-inspection"

export { inspectProject }
export type { ProjectRecord, ProjectSnapshot }

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
