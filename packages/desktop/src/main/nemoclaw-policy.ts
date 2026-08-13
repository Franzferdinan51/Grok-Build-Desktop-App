/** Pure NemoClaw policy helpers. No Electron — tests own the contract. */

export const DEFAULT_NEMO_NETWORK = [
  "api.telegram.org",
  "api.x.ai",
  "integrate.api.nvidia.com",
  "api.openai.com",
  "api.tavily.com",
  "api.search.brave.com",
  "github.com",
  "x.com",
  "twitter.com",
  "api.x.com",
]

export function taskApprovalReason(task: string): string | undefined {
  const rules: Array<[RegExp, string]> = [
    [/\b(delete|remove|destroy|erase|format|wipe)\b/i, "destructive filesystem or data action"],
    [/\b(git\s+(push|reset|clean)|publish|deploy|release)\b/i, "repository or external release action"],
    [/\b(send\s+(an?\s+)?(email|tweet|dm|message)|email\s+\S+@|tweet\s+(this|that|it)\b|post\s+(this|that)\s+(to|on|in)\b)/i, "external communication"],
    [/\b(api\s*key|password|\.env|credential secret|secret key)\b/i, "credential or secret-related action"],
    [/\b(curl|wget|ssh|scp)\b/i, "network or remote-system action"],
  ]
  return rules.find(([pattern]) => pattern.test(task))?.[1]
}
