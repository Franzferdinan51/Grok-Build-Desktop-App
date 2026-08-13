import newTask from "./icons/new-task.png"
import workspace from "./icons/workspace.png"
import terminal from "./icons/terminal.png"
import runs from "./icons/runs.png"
import review from "./icons/review.png"
import skills from "./icons/skills.png"
import scheduled from "./icons/scheduled.png"
import runtime from "./icons/runtime.png"
import agent from "./icons/agent.png"
import browser from "./icons/browser.png"
import settings from "./icons/settings.png"
import artifacts from "./icons/artifacts.png"

export const UI_ICONS = {
  "new-task": newTask,
  workspace,
  terminal,
  runs,
  artifacts,
  review,
  skills,
  scheduled,
  runtime,
  telegram: agent,
  "browser-agent": browser,
  settings,
} as const

export type UiIconId = keyof typeof UI_ICONS

export function uiIcon(id: string): string | undefined {
  return UI_ICONS[id as UiIconId]
}
