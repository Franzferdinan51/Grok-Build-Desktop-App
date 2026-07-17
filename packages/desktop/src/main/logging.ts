/**
 * main/logging.ts — electron-log wrapper
 *
 * Provides a consistent logging API with file rotation.
 * Log files live in app.getPath("logs").
 */

import log from "electron-log/main"
import { app } from "electron"

log.initialize()

// Override console methods so that `console.log` in the main process
// also writes to electron-log (and therefore to file + renderer console)
Object.assign(console, {
  info: (...args: unknown[]) => log.info(...args),
  warn: (...args: unknown[]) => log.warn(...args),
  error: (...args: unknown[]) => log.error(...args),
  log: (...args: unknown[]) => log.info(...args),
  debug: (...args: unknown[]) => log.debug(...args),
})

export function initLogging() {
  log.transports.file.level = "debug"
  log.transports.console.level = process.env.NODE_ENV === "development" ? "debug" : "info"
  log.transports.file.maxSize = 10 * 1024 * 1024 // 10 MB

  log.info("Logging initialized")
  log.info(`Log file: ${log.transports.file.getFile().path}`)
  log.info(`App version: ${app.getVersion()}`)

  return log
}

export { log }
export function write(level: "info" | "warn" | "error" | "debug", message: string): void {
  log[level](message)
}
