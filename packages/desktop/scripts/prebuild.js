/**
 * scripts/prebuild.js — Pre-build validation
 *
 * Runs type checking before building.
 */

const { execSync } = require("child_process")

console.log("Running TypeScript check...")
try {
  execSync("tsc --noEmit", {
    cwd: __dirname + "/..",
    stdio: "inherit",
  })
  console.log("✅ TypeScript check passed")
} catch (err) {
  console.error("❌ TypeScript check failed")
  process.exit(1)
}
