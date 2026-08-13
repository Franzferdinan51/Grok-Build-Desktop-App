import test from "node:test"
import assert from "node:assert/strict"
import { addWorkspaceTask, parseWorkspaceTasks, removeWorkspaceTask, toggleWorkspaceTask } from "./workspace-tasks.ts"
test("workspace tasks parse defensively", () => assert.deepEqual(parseWorkspaceTasks([{ id: "a", content: "Ship it", status: "pending", updatedAt: 1 }, { id: "", content: "bad" }, null]), [{ id: "a", content: "Ship it", status: "pending", updatedAt: 1 }]))
test("workspace tasks support add, toggle, and remove", () => { const added = addWorkspaceTask([], "  Review the diff  ", 10); assert.equal(added[0]?.content, "Review the diff"); const completed = toggleWorkspaceTask(added, added[0].id, 11); assert.equal(completed[0].status, "completed"); assert.deepEqual(removeWorkspaceTask(completed, added[0].id), []) })
