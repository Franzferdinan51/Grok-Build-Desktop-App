import { UI_ICONS } from "./assets/ui-icons"

export const SIDEBAR_NAV = [
  { id: "new-task", label: "Workbench", icon: UI_ICONS["new-task"] },
  { id: "workspace", label: "Workspace", icon: UI_ICONS.workspace },
  { id: "terminal", label: "Terminal", icon: UI_ICONS.terminal },
  { id: "runs", label: "Grok runs", icon: UI_ICONS.runs },
  { id: "artifacts", label: "Artifacts", icon: UI_ICONS.artifacts },
  { id: "review", label: "Review", icon: UI_ICONS.review },
  { id: "skills", label: "Skills", icon: UI_ICONS.skills },
  { id: "workflows", label: "Workflows", icon: UI_ICONS.workflows },
  { id: "scheduled", label: "Scheduled", icon: UI_ICONS.scheduled },
  { id: "runtime", label: "Local runtimes", icon: UI_ICONS.runtime },
  { id: "telegram", label: "Agent", icon: UI_ICONS.telegram },
  { id: "browser-agent", label: "Browser Agent", icon: UI_ICONS["browser-agent"] },
  { id: "settings", label: "Settings", icon: UI_ICONS.settings },
] as const

export type SidebarNavId = typeof SIDEBAR_NAV[number]["id"]
