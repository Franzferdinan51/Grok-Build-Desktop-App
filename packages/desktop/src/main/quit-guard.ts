export interface ActiveGrokWork {
  count: number
}

export interface QuitPrompt {
  message: string
  detail: string
}

/** Keep the quit decision pure so the Electron lifecycle remains easy to test. */
export function quitPromptFor(work: ActiveGrokWork, quittingForHandoff = false): QuitPrompt | null {
  if (quittingForHandoff || work.count < 1) return null

  return {
    message: work.count === 1 ? "Grok Build is still working on a task." : `Grok Build is still working on ${work.count} tasks.`,
    detail: [
      "Quitting stops the active agent task.",
      "Any work it has not finished writing may be lost."
    ].join("\n")
  }
}
