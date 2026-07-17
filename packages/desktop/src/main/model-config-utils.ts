const MANAGED_START = "# BEGIN GROK BUILD DESKTOP MANAGED PROVIDERS"
const MANAGED_END = "# END GROK BUILD DESKTOP MANAGED PROVIDERS"

/** Remove pre-marker Codex bridge tables left by older desktop releases. */
export function removeLegacyCodexBridgeTables(config: string): string {
  const lines = config.split(/\r?\n/)
  const output: string[] = []
  let inManaged = false
  for (let index = 0; index < lines.length;) {
    const line = lines[index]
    if (line.trim() === MANAGED_START) inManaged = true
    if (!inManaged && /^\s*\[model\.codex-[^\]]+\]\s*$/.test(line)) {
      let end = index + 1
      while (end < lines.length && !/^\s*\[/.test(lines[end]) && lines[end].trim() !== MANAGED_START) end++
      const block = lines.slice(index, end).join("\n")
      if (/^\s*env_key\s*=\s*["']GROK_CODEX_OAUTH_BRIDGE_KEY["']\s*$/m.test(block)) {
        while (output.at(-1) === "") output.pop()
        index = end
        continue
      }
    }
    output.push(line)
    if (line.trim() === MANAGED_END) inManaged = false
    index++
  }
  return output.join("\n").replace(/\n{3,}/g, "\n\n")
}
