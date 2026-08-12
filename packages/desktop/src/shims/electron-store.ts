/**
 * Type-only stand-in for `electron-store` so `tsc` does not walk
 * `type-fest` + `conf` declaration graphs. Runtime still loads the real
 * package; this file is only used through tsconfig paths during typecheck.
 */
export default class ElectronStore<T extends Record<string, any> = Record<string, any>> {
  constructor(_options?: { name?: string; defaults?: Partial<T>; clearInvalidConfig?: boolean }) {}
  get<K extends keyof T>(key: K, defaultValue?: T[K]): T[K]
  get(key: string, defaultValue?: any): any
  get(_key: string, defaultValue?: any): any { return defaultValue }
  set(_key: string, _value?: any): void {}
  delete(_key: string): void {}
}
