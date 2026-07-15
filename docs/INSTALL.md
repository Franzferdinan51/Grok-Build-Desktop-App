# Installation & Development Guide

## Prerequisites

- **Node.js** ≥ 20.0.0 (or use the system Node)
- **pnpm** ≥ 9 (monorepo package manager)
  ```bash
  npm install -g pnpm@9
  ```
- **Rust** (only needed if building grok CLI from source)
  ```bash
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
  ```
- **Grok CLI** (required at runtime)
  ```bash
  curl -fsSL https://x.ai/cli/install.sh | bash
  # Verify:
  grok --version
  ```

---

## Quick Start (Development)

```bash
# 1. Clone the repository
git clone https://github.com/Franzferdinan51/Grok-Build-Desktop-App.git
cd Grok-Build-Desktop-App

# 2. Install dependencies
pnpm install

# 3. Run in development mode
pnpm dev
```

The app will open a window with the dark sidebar + empty state UI.

---

## Project Structure

```
Grok-Build-Desktop-App/
├── packages/
│   ├── desktop/          # Electron main + preload + renderer (SolidJS)
│   │   ├── src/
│   │   │   ├── main/     # Main process (IPC, sidecar, store, menu)
│   │   │   ├── preload/  # contextBridge API
│   │   │   └── renderer/ # SolidJS UI (App.tsx, styles.css)
│   │   ├── electron.vite.config.ts
│   │   └── package.json
│   ├── backend/          # Provider abstraction, sidecar logic
│   └── types/            # Shared TypeScript types
├── docs/                 # Architecture, providers, features, install, contributing
└── pnpm-workspace.yaml
```

---

## Running in Development

```bash
# Start all packages (dev mode for desktop auto-restarts on changes)
pnpm dev

# Type check all packages
pnpm typecheck

# Build for production
pnpm build

# Package for current platform
pnpm package
```

---

## Grok CLI Setup

The desktop app downloads the Grok CLI on first run if not found. For manual setup:

```bash
# Official install
curl -fsSL https://x.ai/cli/install.sh | bash

# From fork (if you want a custom version)
git clone https://github.com/Franzferdinan51/grok-build /tmp/grok-build
cd /tmp/grok-build
cargo build -p xai-grok-pager-bin --release
# The binary is target/release/xai-grok-pager

# Set the binary path (optional — auto-detected)
export GROK_CLI_PATH=/path/to/grok
```

### Authentication

The Grok CLI requires an `XAI_API_KEY`:

```bash
# Set environment variable
export XAI_API_KEY="xai-..."

# Or let the CLI open browser for OAuth
grok --version  # First run triggers browser auth
```

---

## LM Studio Setup (Local AI)

```bash
# 1. Download LM Studio: https://lmstudio.ai
# 2. Load a model (e.g., Llama 3.3 70B)
# 3. Enable "API Server" in LM Studio UI
# 4. Note the URL (default: http://localhost:1234)

# For accessing LM Studio on another machine:
# Default network address: http://100.116.54.125:1234
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `XAI_API_KEY` | — | xAI API key for Grok CLI |
| `GROK_CLI_PATH` | auto-detect | Path to grok binary |
| `LM_STUDIO_BASE_URL` | `http://100.116.54.125:1234` | LM Studio API endpoint |
| `OPENAI_API_KEY` | — | OpenAI/Codex API key |

---

## Building the Grok CLI from Source

Only needed if you want to develop on the grok CLI itself or use a fork:

```bash
# Install Rust (if not present)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Clone the fork
git clone https://github.com/Franzferdinan51/grok-build /tmp/grok-build
cd /tmp/grok-build

# Build the CLI binary
cargo build -p xai-grok-pager-bin --release

# The binary is at:
# target/release/xai-grok-pager (macOS/Linux)
# target/release/xai-grok-pager.exe (Windows)

# Test headless mode
./target/release/xai-grok-pager --headless --help
```

---

## Platform-Specific Notes

### macOS

- The app is signed as `ai.grokbuild.desktop`
- System tray is supported (Dock icon)
- Uses macOS-native menus when `process.platform === "darwin"`

### Windows

- Uses `electron-builder` with NSIS installer
- Tray support works via `Tray` API
- May need WSL2 for certain sandbox features

### Linux

- Ships as AppImage (planned)
- FUSE required for AppImage; fallback with `APPIMAGE_EXTRACT_AND_RUN=1`

---

## Troubleshooting

### "Grok binary not found"

```bash
# Check if grok is installed
which grok || echo "not found"

# Manually install
curl -fsSL https://x.ai/cli/install.sh | bash
```

### "Cannot connect to LM Studio"

```bash
# Verify LM Studio is running
curl http://100.116.54.125:1234/v1/models

# Check firewall rules on the LM Studio machine
```

### "Sidecar process exited with code 1"

```bash
# Check grok auth
grok --version

# Run grok manually to see errors
grok --headless --stdio
# Type: { "jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {} }
```

### Dev server not starting

```bash
# Clear node_modules and reinstall
rm -rf node_modules packages/*/node_modules
pnpm install

# Check Node.js version
node --version  # should be >= 20
```

---

## Logs

App logs are written to:
- **macOS**: `~/Library/Logs/Grok Build Desktop/`
- **Linux**: `~/.config/Grok Build Desktop/logs/`
- **Windows**: `%USERPROFILE%\AppData\Roaming\Grok Build Desktop\logs\`

Use `electron-log` file output:
> Source: `packages/desktop/src/main/logging.ts`
