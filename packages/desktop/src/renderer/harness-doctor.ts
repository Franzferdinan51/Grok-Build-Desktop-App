/**
 * Duck-Agent-style doctor summary over the existing Grok Build status
 * surface. It reports facts the desktop already knows; it does not spawn
 * another agent or load models.
 */

export type DoctorInput = {
  available: boolean
  command: string
  version?: string
  error?: string
  grokAuthExists?: boolean
}

export function summarizeHarnessDoctor(input: DoctorInput): { ok: boolean; lines: string[] } {
  const checks = [
    { name: "Grok Build CLI on PATH", pass: input.available, detail: input.available ? input.command : input.error || "grok not found" },
    { name: "Grok Build reports a version", pass: Boolean(input.version), detail: input.version || "unknown" },
    { name: "Grok login or local key present", pass: input.grokAuthExists !== false, detail: input.grokAuthExists === false ? "run grok login or set a provider key" : "ok" },
  ]
  return {
    ok: checks.every((check) => check.pass),
    lines: checks.map((check) => `${check.pass ? "PASS" : "FAIL"}  ${check.name} · ${check.detail}`),
  }
}
