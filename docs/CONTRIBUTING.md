# Contributing to Grok Build Desktop App

Thank you for your interest in contributing!

---

## Code of Conduct

Be respectful, constructive, and collaborative. We follow the [Contributor Covenant](https://www.contributor-covenant.org/).

---

## Getting Started

```bash
# Fork the repo on GitHub
# Clone your fork
git clone https://github.com/<your-username>/Grok-Build-Desktop-App.git
cd Grok-Build-Desktop-App

# Add upstream remote
git remote add upstream https://github.com/Franzferdinan51/Grok-Build-Desktop-App.git

# Install dependencies
pnpm install

# Start dev server
pnpm dev
```

---

## Branch Naming

Use short, descriptive branch names:

```
feat/sidebar-collapse
fix/grok-cli-path
docs/provider-config
chore/update-deps
```

Do **not** use `feat/`, `fix/`, `type/` prefixes — the repo uses bare short names.

---

## Commit Style

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <summary>

Types: feat, fix, docs, chore, refactor, test
Scope: desktop, backend, renderer, sidecar, providers
```

Examples:
```
feat(sidebar): add collapse/expand toggle
fix(sidecar): handle grok binary not found error
docs(providers): add LM Studio config snippet
chore(deps): update electron to 33.3.1
```

---

## Pull Request Process

1. **Fork** the repository and create a branch from `main`
2. **Make your changes** — add tests, update docs
3. **Run typecheck and build**:
   ```bash
   pnpm typecheck && pnpm build
   ```
4. **Open a PR** against `main` with a clear description
5. Link the issue: `Fixes #123` or `Closes #456`
6. Wait for review — two approvals preferred for significant changes

---

## Area Guide

### `packages/desktop/src/main/` — Main Process

- `index.ts` — App lifecycle, window creation
- `sidecar.ts` — Grok CLI lifecycle (download, spawn, JSON-RPC over stdio)
- `ipc.ts` — IPC handler registration
- `store.ts` — Persistent settings (electron-store)
- `menu.ts` — Application menu
- `logging.ts` — electron-log wrapper

**Key reference:** https://github.com/sst/opencode/tree/dev/packages/desktop/src/main

### `packages/desktop/src/preload/` — Context Bridge

- `index.ts` — `contextBridge.exposeInMainWorld("api", ...)` with full TypeScript types

**Key reference:** https://github.com/sst/opencode/blob/dev/packages/desktop/src/preload/index.ts

### `packages/desktop/src/renderer/` — SolidJS UI

- `App.tsx` — Root component: sidebar + empty state layout
- `styles.css` — Dark theme CSS, no Tailwind

**Design inspiration:** MiniMax Code screenshot (dark sidebar, model picker, file attachers)

### `packages/backend/` — Provider Layer

- `providers.ts` — `AIProvider` interface + implementations (GrokProvider, LMStudioProvider, CodexProvider)
- `sidecar-manager.ts` — Re-exports GrokSidecarManager

### `packages/types/` — Shared Types

All shared TypeScript interfaces used across packages.

---

## Adding a New Provider

1. Add provider class to `packages/backend/src/providers.ts`
2. Implement `AIProvider` interface
3. Add to `App.tsx` model picker
4. Add to `store.ts` schema
5. Add config snippet to `docs/PROVIDERS.md`
6. Add row to `docs/FEATURES-INSPO.md`

---

## Testing

```bash
# Run all tests
pnpm test

# Run desktop package tests only
pnpm --filter @grok-build/desktop test

# Lint
pnpm lint
```

---

## Style Guide

- **No `any`** — use `unknown` and narrow
- **No default exports** — named exports only
- **ESM everywhere** — `"type": "module"` in package.json
- **Prefer `const`** — avoid `let` unless reassignment is necessary
- **Early returns** — avoid `else` after early return
- **Pure CSS** — no Tailwind, no CSS-in-JS, plain `.css` files
- **Dark theme** — all UI must work on dark backgrounds (#0d0d0f base)

---

## Documentation

Update relevant docs when adding features:

| File | When to update |
|------|---------------|
| `docs/ARCHITECTURE.md` | New process architecture, IPC channels |
| `docs/PROVIDERS.md` | New provider, config changes |
| `docs/FEATURES-INSPO.md` | New feature with source citation |
| `docs/INSTALL.md` | New dependencies, platform notes |
| `README.md` | Breaking changes, new quickstart |

---

## Issue Labels

| Label | Meaning |
|-------|---------|
| `good first issue` | Small, well-defined, good for newcomers |
| `help wanted` | Wanted but not actively assigned |
| `enhancement` | New feature request |
| `bug` | Confirmed bug |
| `documentation` | Docs-only change |
| `provider` | Related to a specific AI provider |

---

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
