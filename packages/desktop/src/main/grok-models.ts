/**
 * Pure parsing of `grok models` output. The shipped CLI prints one line per
 * model in two formats:
 *   "* <model-id> (default)"  — the default model
 *   "- <model-id>"            — every other available model
 * Embedded blank lines and the surrounding prose ("Available models:") are
 * skipped. The output is normalized to a stable catalog: first occurrence
 * of the default wins, duplicates are removed while preserving order.
 */

export type GrokBuildModelCatalog = {
  defaultModel?: string
  models: string[]
}

const DEFAULT_MODEL_RE = /^\s*\*\s+(.+?)\s+\(default\)\s*$/
const REGULAR_MODEL_RE = /^\s*-\s+(.+?)\s*$/

/** Parse `grok models` stdout into the catalog object the UI consumes. */
export function parseGrokModels(stdout: string): GrokBuildModelCatalog {
  const models: string[] = []
  let defaultModel: string | undefined
  for (const raw of stdout.split(/\r?\n/)) {
    const defaultMatch = raw.match(DEFAULT_MODEL_RE)
    if (defaultMatch) {
      defaultModel = defaultMatch[1]
      models.push(defaultModel)
      continue
    }
    const regularMatch = raw.match(REGULAR_MODEL_RE)
    if (regularMatch) models.push(regularMatch[1])
  }
  return { defaultModel, models: [...new Set(models)] }
}
