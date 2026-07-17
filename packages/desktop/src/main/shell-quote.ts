/**
 * Tiny POSIX-ish shell tokenizer used to split a single user-typed command
 * line into argv tokens without involving a real shell.
 *
 * Replaces the prior `commandLine.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g)`
 * regex in GrokBuildBackend.runTool, which silently misbehaved on a few
 * common inputs:
 *   - embedded escaped quotes inside a double-quoted segment (the inner
 *     `\"` ended the regex match prematurely)
 *   - empty quoted strings (`""` or `''` produced a single-character token
 *     containing the quote pair, never an empty string)
 *   - an unmatched quote (the regex dropped the rest of the line)
 *
 * This tokenizer:
 *   - skips leading whitespace between tokens
 *   - treats single-quoted segments as literal (no escapes)
 *   - treats double-quoted segments with backslash escapes (`\\`, `\"`,
 *     `\n`, `\t`, `\r`) as POSIX shells do
 *   - collapses bare adjacent quoted segments into one token
 *     (`'a'"b"'c'` → `abc`)
 *   - throws a typed ShellQuoteError with the input offset when a quoted
 *     segment is unterminated, so the caller can show a useful UI message
 */

export class ShellQuoteError extends Error {
  readonly offset: number
  readonly input: string
  constructor(message: string, offset: number, input: string) {
    super(`${message} (at offset ${offset})`)
    this.name = "ShellQuoteError"
    this.offset = offset
    this.input = input
  }
}

/**
 * Tokenize a single command line. Returns an array of argv strings;
 * empty input or pure-whitespace input returns an empty array. The
 * `start` parameter is exposed for callers that want to tokenize from
 * a sub-offset (used in error reporting and tests).
 */
export function tokenizeCommandLine(input: string, start = 0): string[] {
  const tokens: string[] = []
  let i = start
  const n = input.length

  const skipWhitespace = () => {
    while (i < n && (input.charCodeAt(i) === 32 || input.charCodeAt(i) === 9)) i++
  }
  skipWhitespace()

  while (i < n) {
    let token = ""
    let inToken = false
    while (i < n) {
      const ch = input[i]
      const code = input.charCodeAt(i)
      if (ch === " " || ch === "\t") {
        i++
        break
      }
      if (ch === "'") {
        inToken = true
        i++
        const startQuote = i
        const close = input.indexOf("'", i)
        if (close < 0) throw new ShellQuoteError("Unterminated single-quoted segment", startQuote - 1, input)
        token += input.slice(i, close)
        i = close + 1
        continue
      }
      if (ch === '"') {
        inToken = true
        i++
        const startQuote = i
        while (i < n) {
          const c = input[i]
          if (c === "\\") {
            const next = input[i + 1]
            if (next === undefined) throw new ShellQuoteError("Unterminated escape sequence in double-quoted segment", i, input)
            if (next === "n") token += "\n"
            else if (next === "t") token += "\t"
            else if (next === "r") token += "\r"
            else if (next === "\\" || next === '"' || next === "$" || next === "`") token += next
            else token += next
            i += 2
            continue
          }
          if (c === '"') {
            i++
            break
          }
          token += c
          i++
        }
        if (i > n || (i === n && input[i - 1] !== '"')) {
          throw new ShellQuoteError("Unterminated double-quoted segment", startQuote - 1, input)
        }
        continue
      }
      if (ch === "\\") {
        const next = input[i + 1]
        if (next === undefined) throw new ShellQuoteError("Trailing backslash outside of quotes", i, input)
        inToken = true
        token += next
        i += 2
        continue
      }
      inToken = true
      token += ch
      i++
    }
    if (inToken) tokens.push(token)
    skipWhitespace()
  }

  return tokens
}
