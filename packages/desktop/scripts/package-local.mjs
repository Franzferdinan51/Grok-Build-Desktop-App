/**
 * Compile and package a local macOS .app without walking packages/desktop/dist.
 * electron-vite build hangs in this repo when dist/mac-arm64/*.app is present.
 */
import { createRequire } from "node:module"
import { build as viteBuild } from "vite"
import solid from "vite-plugin-solid"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { dirname, join, resolve, relative } from "node:path"
import { mkdirSync, rmSync, existsSync, cpSync, readFileSync, writeFileSync, readdirSync, readlinkSync, realpathSync, renameSync, symlinkSync } from "node:fs"

const require = createRequire(join(resolve(dirname(fileURLToPath(import.meta.url)), ".."), "package.json"))
const { build: esbuild } = require(require.resolve("esbuild", { paths: [dirname(require.resolve("vite"))] }))
const { createPackage } = require(require.resolve("@electron/asar", { paths: [dirname(require.resolve("electron-builder"))] }))

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const repoRoot = resolve(root, "../..")
const outMain = join(root, "out/main/index.js")
const outPreload = join(root, "out/preload/index.js")
const outRenderer = join(root, "out/renderer")
const installDir = join(root, "dist-install")
const appName = "Grok Build Desktop.app"

console.log("Compiling main…")
await esbuild({
  absWorkingDir: root,
  entryPoints: [join(root, "src/main/index.ts")],
  outfile: outMain,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  banner: { js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);' },
  alias: { "electron-store": require.resolve("electron-store") },
  sourcemap: false,
  external: ["electron", "playwright", "playwright-core", "chromium-bidi", "fsevents"],
  logLevel: "info",
})

console.log("Compiling preload…")
await esbuild({
  absWorkingDir: root,
  entryPoints: [join(root, "src/preload/index.ts")],
  outfile: outPreload,
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  sourcemap: false,
  packages: "external",
  external: ["electron"],
  logLevel: "info",
})

console.log("Compiling renderer…")
await viteBuild({
  root: join(root, "src/renderer"),
  base: "./",
  configFile: false,
  logLevel: "info",
  plugins: [solid()],
  build: {
    outDir: outRenderer,
    emptyOutDir: true,
    rollupOptions: {
      input: join(root, "src/renderer/index.html"),
    },
  },
})

if (existsSync(installDir)) rmSync(installDir, { recursive: true, force: true })
mkdirSync(installDir, { recursive: true })

const electronApp = [
  join(root, "node_modules/electron/dist/Electron.app"),
  join(repoRoot, "node_modules/electron/dist/Electron.app"),
  join(repoRoot, "node_modules/.pnpm/electron@43.1.1/node_modules/electron/dist/Electron.app"),
].find((path) => existsSync(path))
if (!electronApp) {
  console.error("Electron.app not found. Run pnpm install from the repo root.")
  process.exit(1)
}

const builtApp = join(installDir, appName)
const electronRoot = realpathSync(electronApp)
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
console.log(`Assembling unsigned ${appName} from Electron ${pkg.version}…`)
cpSync(electronApp, builtApp, { recursive: true, dereference: true })
renameSync(join(builtApp, "Contents/MacOS/Electron"), join(builtApp, "Contents/MacOS/Grok Build Desktop"))

// Electron's framework bundle contains symlinks. cpSync can preserve those
// links as absolute paths into node_modules, which breaks after installation.
// Rebase copied Electron-internal links so the app is self-contained.
const repairLinks = (directory, sourceRoot, targetRoot) => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const targetPath = join(directory, entry.name)
    if (entry.isSymbolicLink()) {
      const target = readFileLink(targetPath)
      if (target.startsWith(sourceRoot)) {
        const mapped = join(targetRoot, relative(sourceRoot, target))
        rmSync(targetPath, { force: true })
        symlinkSync(relative(dirname(targetPath), mapped), targetPath)
      }
    } else if (entry.isDirectory()) {
      repairLinks(targetPath, sourceRoot, targetRoot)
    }
  }
}
const readFileLink = (path) => readlinkSync(path)
repairLinks(builtApp, electronRoot, builtApp)
rmSync(join(builtApp, "Contents/Resources/default_app.asar"), { force: true })

const appDir = join(builtApp, "Contents/Resources/app")
mkdirSync(appDir, { recursive: true })
writeFileSync(join(appDir, "package.json"), `${JSON.stringify({
  name: pkg.name,
  version: pkg.version,
  type: pkg.type || "module",
  main: "out/main/index.js",
}, null, 2)}\n`)
cpSync(join(root, "out"), join(appDir, "out"), { recursive: true })
await createPackage(appDir, join(builtApp, "Contents/Resources/app.asar"))
rmSync(appDir, { recursive: true, force: true })

const resources = join(builtApp, "Contents/Resources")
if (existsSync(join(root, "resources/icon.icns"))) cpSync(join(root, "resources/icon.icns"), join(resources, "icon.icns"))
if (existsSync(join(root, "resources/icon.png"))) cpSync(join(root, "resources/icon.png"), join(resources, "icon.png"))
if (existsSync(join(root, "resources/grok-skills"))) cpSync(join(root, "resources/grok-skills"), join(resources, "grok-skills"), { recursive: true })

const plist = join(builtApp, "Contents/Info.plist")
const buddy = (command) => {
  const result = spawnSync("/usr/libexec/PlistBuddy", ["-c", command, plist], { encoding: "utf8" })
  if (result.status !== 0) console.warn(command, result.stderr || result.stdout)
}
buddy("Set :CFBundleName Grok Build Desktop")
buddy("Set :CFBundleDisplayName Grok Build Desktop")
buddy("Set :CFBundleExecutable Grok Build Desktop")
buddy("Set :CFBundleIdentifier ai.grokbuild.desktop")
buddy("Set :CFBundleIconFile icon.icns")
buddy(`Set :CFBundleShortVersionString ${pkg.version}`)
buddy(`Set :CFBundleVersion ${pkg.version}`)
buddy("Set :LSApplicationCategoryType public.app-category.developer-tools")
spawnSync("/usr/libexec/PlistBuddy", ["-c", "Delete :ElectronAsarIntegrity", plist], { stdio: "ignore" })

const applications = "/Applications/Grok Build Desktop.app"
console.log(`Installing to ${applications}`)
rmSync(applications, { recursive: true, force: true })
cpSync(builtApp, applications, { recursive: true })
repairLinks(applications, builtApp, applications)
spawnSync("xattr", ["-cr", applications], { stdio: "inherit" })

const distApp = join(root, "dist/mac-arm64", appName)
if (existsSync(dirname(distApp))) {
  console.log(`Replacing ${distApp}`)
  rmSync(distApp, { recursive: true, force: true })
  cpSync(builtApp, distApp, { recursive: true })
  repairLinks(distApp, builtApp, distApp)
  spawnSync("xattr", ["-cr", distApp], { stdio: "inherit" })
}

console.log("Installed.")
console.log(applications)
