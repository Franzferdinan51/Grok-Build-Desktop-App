export function workbenchWorkspaceLabel(workspace: string): string {
  return workspace.split(/[\\/]/).filter(Boolean).at(-1) || "Scratch"
}
