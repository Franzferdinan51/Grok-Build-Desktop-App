import { ipcMain } from "electron"
import type { DesktopUpdater } from "./desktop-updater"

export function registerDesktopUpdaterIpc(updater: DesktopUpdater): void {
  ipcMain.handle("desktop-update:state", () => updater.state())
  ipcMain.handle("desktop-update:check", () => updater.check({ manual: true }))
  ipcMain.handle("desktop-update:download", () => updater.download())
  ipcMain.handle("desktop-update:install", () => updater.install())
}
