import { defineConfig } from "electron-vite"
import { resolve } from "path"

// The Grok CLI sidecar is a Node.js script that manages the Rust grok binary.
// It is bundled separately from the main process and loaded as a Worker thread
// or child process — mirroring the opencode "virtual server module" pattern.
// See: https://github.com/sst/opencode/blob/dev/packages/desktop/electron.vite.config.ts
const GROK_SIDECAR_ENTRY = resolve(__dirname, "src/main/sidecar-runner.js")

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, "src/main/index.ts"),
          // Sidecar bundle — loaded at runtime, not at startup
          // This avoids bundling the Rust grok binary into the Electron asar
        },
        output: {
          banner: `
// -- CommonJS Shims for Electron main process --
import __cjs_mod__ from 'node:module';
const __filename = import.meta.url;
const __dirname = import.meta.dirname;
const require = __cjs_mod__.createRequire(import.meta.url);
`,
        },
      },
      outDir: resolve(__dirname, "../../../out/main"),
    },
    resolve: {
      alias: {
        "@backend": resolve(__dirname, "../../backend/src"),
        "@types": resolve(__dirname, "../../types/src"),
      },
    },
  },
  preload: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, "src/preload/index.ts"),
        },
        output: {
          format: "cjs",
          entryFileNames: "[name].js",
        },
      },
    },
    outDir: resolve(__dirname, "../../../out/preload"),
  },
  renderer: {
    root: resolve(__dirname, "src/renderer"),
    build: {
      outDir: resolve(__dirname, "../../../out/renderer"),
      rollupOptions: {
        input: {
          main: resolve(__dirname, "src/renderer/index.html"),
        },
      },
    },
    resolve: {
      alias: {
        "@renderer": resolve(__dirname, "src/renderer"),
      },
    },
    plugins: [],
  },
})
