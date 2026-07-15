/**
 * scripts/prebuild.js — Pre-build validation
 *
 * Runs type checking before building.
 */

import { execSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const scriptDir = dirname(fileURLToPath(import.meta.url))

console.log("Running TypeScript check...")
try {
  execSync("tsc --noEmit", {
    cwd: join(scriptDir, ".."),
    stdio: "inherit",
  })
  console.log("✅ TypeScript check passed")
} catch (err) {
  console.error("❌ TypeScript check failed")
  process.exit(1)
}
