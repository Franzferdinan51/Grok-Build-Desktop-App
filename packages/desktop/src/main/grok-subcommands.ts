/**
 * Pure parsing of the documented Grok Build subcommand list.
 *
 * The CLI prints the `Commands:` block in `grok --help` output with one
 * subcommand per line in `  <name>   <description>` form. Extracting the
 * subcommand set at runtime (instead of hard-coding it on the desktop)
 * is what the user asked for: the desktop should delegate to whatever
 * the installed CLI actually documents, not to a frozen allowlist that
 * silently drifts as Grok Build adds new subcommands.
 */

export type GrokSubcommand = {
  name: string
  description: string
}

const COMMANDS_HEADER = /^Commands:\s*$/m

/**
 * Extract the documented subcommand list from `grok --help` stdout.
 * Returns an empty array if the `Commands:` block is missing or
 * unparseable so callers can fall back to a hard-coded safe list.
 */
export function parseGrokSubcommands(helpText: string): GrokSubcommand[] {
  const match = COMMANDS_HEADER.exec(helpText)
  if (!match) return []
  const block = helpText.slice(match.index! + match[0].length)
  const commands: GrokSubcommand[] = []
  for (const raw of block.split(/\r?\n/)) {
    // Skip the leading blank line(s) that clap emits after the header.
    if (raw.trim() === "") continue
    // Each subcommand line starts with exactly two spaces, then the name,
    // then padding spaces, then the description. A line that does not
    // match either pattern means we have left the Commands block
    // (clap emits trailing whitespace but never a bare Options line).
    const lineMatch = /^ {2}(\S+)\s{2,}(.*)$/.exec(raw)
    if (!lineMatch) break
    commands.push({ name: lineMatch[1]!, description: lineMatch[2]!.trim() })
  }
  return commands
}

/**
 * Convenience helper: extract just the subcommand names. Use this when the
 * caller needs a set lookup (e.g. to validate a user-typed subcommand).
 */
export function parseGrokSubcommandNames(helpText: string): string[] {
  return parseGrokSubcommands(helpText).map((entry) => entry.name)
}
