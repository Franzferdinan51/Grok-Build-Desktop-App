export type WorkspaceTask = { id: string; content: string; status: "pending" | "in_progress" | "completed"; updatedAt: number }
const MAX_TASKS = 100
export function parseWorkspaceTasks(value: unknown): WorkspaceTask[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return []
    const candidate = item as Record<string, unknown>
    const id = typeof candidate.id === "string" ? candidate.id.trim() : ""
    const content = typeof candidate.content === "string" ? candidate.content.trim() : ""
    const status: WorkspaceTask["status"] = candidate.status === "completed" || candidate.status === "in_progress" ? candidate.status : "pending"
    const updatedAt = typeof candidate.updatedAt === "number" && Number.isFinite(candidate.updatedAt) ? candidate.updatedAt : Date.now()
    return id && content ? [{ id, content, status, updatedAt }] : []
  }).slice(0, MAX_TASKS)
}
export function addWorkspaceTask(tasks: WorkspaceTask[], content: string, now = Date.now()): WorkspaceTask[] {
  const text = content.trim()
  if (!text || tasks.length >= MAX_TASKS) return tasks
  return [...tasks, { id: `${now}-${Math.random().toString(36).slice(2, 8)}`, content: text, status: "pending", updatedAt: now }]
}
export function toggleWorkspaceTask(tasks: WorkspaceTask[], id: string, now = Date.now()): WorkspaceTask[] { return tasks.map((task) => task.id === id ? { ...task, status: task.status === "completed" ? "pending" : "completed", updatedAt: now } : task) }
export function removeWorkspaceTask(tasks: WorkspaceTask[], id: string): WorkspaceTask[] { return tasks.filter((task) => task.id !== id) }
