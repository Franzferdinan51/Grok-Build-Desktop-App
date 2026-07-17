/**
 * electron-builder.config.ts — Electron app packaging configuration
 */

import type { Configuration } from "electron-builder"

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
  extraMetadata: {
    main: "out/main/index.js",
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
