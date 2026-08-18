# Desktop GitHub Updater Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reliable Grok Build Desktop application updater that checks GitHub Releases, downloads the correct packaged update, shows progress/release information, and restarts into the downloaded version.

**Architecture:** Keep desktop application updates separate from the existing Grok Build CLI updater. A main-process `DesktopUpdater` owns `electron-updater`, exposes a small immutable state snapshot, and broadcasts state changes over IPC; preload exposes a typed API; a self-contained Settings card subscribes to that API. GitHub Releases remain the only desktop update source and electron-builder generates the platform metadata consumed by `electron-updater`.

**Tech Stack:** Electron 43, electron-updater 6.3, electron-builder 26, TypeScript 5.7, SolidJS, Node test runner, GitHub Actions.

**Spec:** Approved in the 2026-08-17 ChatGPT thread: GitHub-release updater with explicit check/download/install states, progress, startup checks, and Restart & install.

## Global Constraints

- Preserve the existing Grok Build CLI updater and its `backend:update-*` IPC paths.
- Desktop updates use `Franzferdinan51/Grok-Build-Desktop-App` GitHub Releases only.
- Do not auto-install while a Grok task is active.
- macOS continues to emit both `dmg` and `zip`; Windows continues to use NSIS.
- Automatic desktop checks are throttled; manual checks always run.
- Renderer gets no direct Node/Electron update access; all update operations pass through preload IPC.
- Downloaded desktop updates install only from the explicit Restart & install action (`autoInstallOnAppQuit=false`).
- Tagged macOS releases must be Developer ID signed; CI fails rather than publishing an unsigned build that electron-updater cannot apply.

---

### Task 1: Tested desktop-update state model

**Files:**
- Create: `packages/desktop/src/main/desktop-update-state.test.ts`
- Create: `packages/desktop/src/main/desktop-update-state.ts`

**Interfaces:**
- Produces: `DesktopUpdateState`, `initialDesktopUpdateState(currentVersion)`, `updateAvailableState(state, info)`, `downloadProgressState(state, progress)`, `updateReadyState(state, info)`, `updateErrorState(state, error)`.

- [x] Write a test that first asserts the state module exists, then verifies available/download/ready/error transitions.
- [x] Run the unit suite and confirm the test fails because the state module does not exist.
- [x] Implement the pure state helpers.
- [x] Run the unit suite and confirm it passes.

### Task 2: Main-process updater and GitHub publish metadata

**Files:**
- Create: `packages/desktop/src/main/desktop-updater.ts`
- Create: `packages/desktop/src/main/desktop-updater-ipc.ts`
- Modify: `packages/desktop/electron-builder.config.ts`
- Modify: `packages/desktop/src/main/index.ts`

**Interfaces:**
- Produces: `DesktopUpdater.start()`, `.state()`, `.check({ manual })`, `.download()`, `.install()`.
- IPC: `desktop-update:state`, `desktop-update:check`, `desktop-update:download`, `desktop-update:install`.

- [x] Configure `{ provider: "github", owner: "Franzferdinan51", repo: "Grok-Build-Desktop-App" }` in electron-builder.
- [x] Wrap `electron-updater` using its ESM-compatible default import/destructure pattern, with `autoDownload=false`, `autoInstallOnAppQuit=false`, progress/error event handling, and a startup/focus cooldown.
- [x] Reject install while the backend has active work; otherwise call `quitAndInstall(false, true)`.
- [x] Register updater IPC separately from the existing CLI updater.
- [x] Require signed macOS tagged releases so the updater cannot ship a Mac artifact that cannot self-update.

### Task 3: Typed preload API and Settings UI

**Files:**
- Modify: `packages/desktop/src/preload/index.ts`
- Create: `packages/desktop/src/renderer/DesktopUpdateCard.tsx`
- Modify: `packages/desktop/src/renderer/views/SettingsPanel.tsx`

**Interfaces:**
- `window.api.app.desktopUpdateState()`
- `window.api.app.checkDesktopUpdate()`
- `window.api.app.downloadDesktopUpdate()`
- `window.api.app.installDesktopUpdate()`
- `window.api.app.onDesktopUpdateState(handler)`

- [x] Add typed preload methods and event subscription.
- [x] Build a Settings card beside the existing CLI update card, clearly labeled “Grok Build Desktop updates”.
- [x] Show current/available version, release notes, download progress, errors, and the appropriate action button for each state.
- [x] Keep application-update copy distinct from CLI-update copy.

### Task 4: CI and release-path verification

**Files:**
- Modify: `.github/workflows/smoke.yml`
- Modify: `.github/workflows/release.yml`

**Interfaces:**
- PR CI runs typecheck, unit tests, and smoke tests on macOS and Windows.
- Tagged release creates one draft, uploads each platform's installer and matching update metadata, then publishes only after both platform jobs succeed.

- [x] Add `pnpm test:unit` to PR smoke CI so updater state tests execute before merge.
- [x] Make tagged package jobs publish installers and `latest*.yml` from the same electron-builder build into a draft release.
- [x] Publish the draft only after both macOS and Windows package jobs succeed.
- [ ] Run PR CI on macOS and Windows; fix every type/test/smoke failure.
- [ ] Merge only after green verification, then confirm `main` CI remains green.
