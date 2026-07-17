const COMPLEX_AGENT_TASK = /\b(build|implement|fix|debug|review|audit|analy[sz]e|research|create|write|design|refactor|migrate|test|investigate|optimi[sz]e|deploy)\b/i

/** MoA is valuable for substantive work, but makes greetings and controls slow. */
export function telegramTaskNeedsMoa(text: string): boolean {
  const task = text.trim()
  return task.length >= 120 || COMPLEX_AGENT_TASK.test(task)
}
