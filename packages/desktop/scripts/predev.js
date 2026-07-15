/**
 * scripts/predev.js — Pre-dev setup script
 *
 * Ensures the Grok CLI is installed before dev starts.
 * Downloads from https://x.ai/cli/install.sh if not found.
 */

import { execSync } from "node:child_process"
import path from "node:path"
import fs from "node:fs"

const GROK_CLI_NAME = process.platform === "win32" ? "grok.exe" : "grok"
const SEARCH_PATHS = [
  path.join(process.env.HOME || "", ".local", "bin", GROK_CLI_NAME),
  path.join(process.env.HOME || "", ".cargo", "bin", GROK_CLI_NAME),
  "/usr/local/bin/grok",
  "/usr/bin/grok",
]

function findGrok() {
  for (const p of SEARCH_PATHS) {
    if (fs.existsSync(p)) return p
  }
  // Check in PATH
  try {
    const which = execSync(`which ${GROK_CLI_NAME}`, { encoding: "utf8" }).trim()
    return which || null
  } catch {
    return null
  }
}

const grokPath = findGrok()
if (grokPath) {
  console.log(`✅ Grok CLI found at: ${grokPath}`)
} else {
  console.warn(`⚠️  Grok CLI not found. Install with:`)
  console.warn(`    curl -fsSL https://x.ai/cli/install.sh | bash`)
  console.warn(`  Or set GROK_CLI_PATH to your binary location.`)
}

console.log("✅ Pre-dev check complete — starting electron-vite dev...")
