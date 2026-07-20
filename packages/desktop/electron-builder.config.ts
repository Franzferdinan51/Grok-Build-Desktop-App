/**
 * electron-builder.config.ts — Electron app packaging configuration
 */

import type { Configuration } from "electron-builder"
import { execFileSync } from "node:child_process"

const config: Configuration = {
  appId: "ai.grokbuild.desktop",
  productName: "Grok Build Desktop",
  copyright: "Copyright 2026 Grok Build Desktop",
  directories: {
    output: "dist",
    buildResources: "resources",
  },
  files: [
    "out/**/*",
    "!out/**/*.map",
  ],
  extraResources: [
    { from: "resources/grok-skills", to: "grok-skills" },
    { from: "resources/icon.png", to: "icon.png" },
  ],
  extraMetadata: {
    main: "out/main/index.js",
  },
  afterPack: async (context) => {
    if (context.electronPlatformName === "darwin") execFileSync("xattr", ["-cr", context.appOutDir])
  },
  mac: {
    icon: "icon.icns",
    category: "public.app-category.developer-tools",
    target: ["dmg", "zip"],
    artifactName: "${productName}-${version}-mac.${ext}",
  },
  win: {
    icon: "icon.png",
    target: ["nsis"],
    artifactName: "${productName}-${version}-win.${ext}",
  },
  linux: {
    icon: "icon.png",
    target: ["AppImage"],
    category: "Development",
    artifactName: "${productName}-${version}-linux.${ext}",
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
  },
}

export default config
