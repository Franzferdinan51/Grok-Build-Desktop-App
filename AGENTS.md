# AGENTS.md — Grok Build Desktop App

This is the root agent document for the Grok Build Desktop App project. Follow this when working in this repository.

---

## Project Identity

**Name**: Grok Build Desktop App
**GitHub**: https://github.com/Franzferdinan51/Grok-Build-Desktop-App
**Stack**: Electron + SolidJS + electron-vite + Rust (grok CLI sidecar)
**License**: MIT

---

## First Run

```bash
pnpm install
pnpm dev
```

---

## Key Files

| File | Purpose |
|------|---------|
| `packages/desktop/src/main/sidecar.ts` | Grok CLI lifecycle + JSON-RPC over stdio |
| `packages/desktop/src/main/ipc.ts` | IPC handler registration |
| `packages/desktop/src/preload/index.ts` | contextBridge API for renderer |
| `packages/desktop/src/renderer/App.tsx` | SolidJS root — sidebar + empty state |
| `packages/backend/src/providers.ts` | Provider abstraction (Grok, LM Studio, Codex) |
| `docs/ARCHITECTURE.md` | Full system design |
| `docs/PROVIDERS.md` | Provider configs |
| `docs/FEATURES-INSPO.md` | 35-row feature citation matrix |

---

## Stack Rules

1. **No `any`** — use `unknown` and narrow
2. **ESM everywhere** — no CJS in src
3. **Pure CSS** — no Tailwind
4. **Dark theme** — base `#0d0d0f`
5. **Named exports only** — no default exports
6. **Early returns** — avoid `else` after early return

---

## Grok CLI Sidecar Protocol

The Grok CLI is spawned as a child process. It speaks JSON-RPC 2.0 over stdio in headless mode:

```bash
grok --headless --stdio
```

All communication goes through `packages/desktop/src/main/sidecar.ts` → IPC (`grok:send`) → renderer.

---

## Adding a Provider

1. Add class in `packages/backend/src/providers.ts` implementing `AIProvider`
2. Add to `App.tsx` model picker
3. Update `store.ts` schema
4. Document in `docs/PROVIDERS.md`
5. Add row to `docs/FEATURES-INSPO.md`

---

## Commit Style

```
feat(sidebar): add collapse animation
fix(sidecar): handle missing grok binary gracefully
docs(providers): add Codex OAuth flow
chore(deps): update electron to 33.3.1
```

---

## Style Reference

- opencode AGENTS.md: https://github.com/sst/opencode/blob/dev/AGENTS.md
- SolidJS patterns in opencode renderer: https://github.com/sst/opencode/tree/dev/packages/desktop/src/renderer
- Dark theme CSS: `packages/desktop/src/renderer/styles.css`

---

## Grok CLI Development

```bash
# Build grok from fork
git clone https://github.com/Franzferdinan51/grok-build /tmp/grok-build
cd /tmp/grok-build
cargo build -p xai-grok-pager-bin --release

# Test headless mode
./target/release/xai-grok-pager --headless --stdio
```

---

## Relevant Repos (Citation Sources)

| Repo | What we use |
|------|-------------|
| https://github.com/sst/opencode | Electron + SolidJS stack, sidecar pattern, IPC |
| https://github.com/openchamber/openchamber | Plan/build mode, skills, multi-agent, timeline |
| https://github.com/xai-org/grok-build | Grok CLI, ACP, headless, sandbox, MCP |
| https://github.com/sourcegraph/cody-public-snapshot | Codebase context architecture |
| https://github.com/openclaw/openclaw | Tray/node mode, gateway pattern |
