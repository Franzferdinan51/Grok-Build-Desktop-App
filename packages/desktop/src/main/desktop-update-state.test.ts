import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import test from "node:test"

type StateModule = typeof import("./desktop-update-state.ts")

async function loadStateModule(): Promise<StateModule> {
  const moduleUrl = new URL("./desktop-update-state.ts", import.meta.url)
  assert.equal(existsSync(fileURLToPath(moduleUrl)), true, "desktop-update-state.ts must exist")
  return import("./desktop-update-state.ts")
}

test("desktop update state moves from checking through available, download, and ready", async () => {
  const state = await loadStateModule()
  const initial = state.initialDesktopUpdateState("0.2.37")
  assert.equal(initial.phase, "idle")
  assert.equal(initial.currentVersion, "0.2.37")

  const checking = state.updateCheckingState(initial)
  assert.equal(checking.phase, "checking")
  assert.equal(checking.error, undefined)

  const available = state.updateAvailableState(checking, {
    version: "0.2.38",
    releaseName: "Grok Build Desktop 0.2.38",
    releaseNotes: "Updater improvements",
  })
  assert.equal(available.phase, "available")
  assert.equal(available.currentVersion, "0.2.37")
  assert.equal(available.availableVersion, "0.2.38")
  assert.equal(available.releaseName, "Grok Build Desktop 0.2.38")
  assert.equal(available.releaseNotes, "Updater improvements")

  const downloading = state.downloadProgressState(available, {
    percent: 42.5,
    transferred: 425,
    total: 1000,
    bytesPerSecond: 250,
  })
  assert.equal(downloading.phase, "downloading")
  assert.equal(downloading.percent, 42.5)
  assert.equal(downloading.transferred, 425)
  assert.equal(downloading.total, 1000)
  assert.equal(downloading.bytesPerSecond, 250)

  const ready = state.updateReadyState(downloading, { version: "0.2.38" })
  assert.equal(ready.phase, "ready")
  assert.equal(ready.availableVersion, "0.2.38")
  assert.equal(ready.percent, 100)
})

test("up-to-date and unsupported states retain the installed version", async () => {
  const state = await loadStateModule()
  const initial = state.initialDesktopUpdateState("0.2.37")

  const current = state.updateNotAvailableState(initial, { version: "0.2.37" }, 1234)
  assert.equal(current.phase, "up-to-date")
  assert.equal(current.currentVersion, "0.2.37")
  assert.equal(current.checkedAt, 1234)
  assert.equal(current.availableVersion, undefined)

  const unsupported = state.updateUnsupportedState(initial, "Desktop updates require an installed build")
  assert.equal(unsupported.phase, "unsupported")
  assert.equal(unsupported.currentVersion, "0.2.37")
  assert.equal(unsupported.error, "Desktop updates require an installed build")
})

test("desktop update errors preserve version context and expose a safe message", async () => {
  const state = await loadStateModule()
  const initial = state.updateAvailableState(state.initialDesktopUpdateState("0.2.37"), { version: "0.2.38" })
  const failed = state.updateErrorState(initial, new Error("network unavailable"), 2345)

  assert.equal(failed.phase, "error")
  assert.equal(failed.currentVersion, "0.2.37")
  assert.equal(failed.availableVersion, "0.2.38")
  assert.equal(failed.error, "network unavailable")
  assert.equal(failed.checkedAt, 2345)
})

test("desktop update progress is clamped to a valid percentage", async () => {
  const state = await loadStateModule()
  const initial = state.initialDesktopUpdateState("0.2.37")

  assert.equal(state.downloadProgressState(initial, { percent: -5 }).percent, 0)
  assert.equal(state.downloadProgressState(initial, { percent: 150 }).percent, 100)
})
