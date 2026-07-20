import { defineConfig } from "electron-vite"
import { resolve } from "path"
import solid from "vite-plugin-solid"

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        // Playwright loads optional protocol helpers with CommonJS `require`.
        // Keeping it external lets Electron run Playwright's supported Node
        // package directly instead of bundling that loader into our ESM main.
        external: ["playwright", "playwright-core", "chromium-bidi"],
        input: {
          index: resolve(__dirname, "src/main/index.ts"),
        },
      },
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
  },
  renderer: {
    root: resolve(__dirname, "src/renderer"),
    build: {
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
    plugins: [solid()],
  },
})
