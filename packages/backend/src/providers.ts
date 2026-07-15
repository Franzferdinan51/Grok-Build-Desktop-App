/**
 * Local model endpoint helpers. Grok Build itself is executed by
 * packages/desktop/src/main/grok-build-backend.ts.
 */

export type ModelInfo = { id: string; name: string }

export class LMStudioProvider {
  readonly id = "lmstudio"
  readonly label = "LM Studio"

  constructor(private baseUrl = "http://localhost:1234") {}

  async listModels(): Promise<ModelInfo[]> {
    const response = await fetch(`${this.baseUrl}/v1/models`, { signal: AbortSignal.timeout(3_000) })
    if (!response.ok) throw new Error(`LM Studio returned ${response.status}`)
    const payload = await response.json() as { data?: { id: string }[] }
    return (payload.data ?? []).map((model) => ({ id: model.id, name: model.id }))
  }

  async ping(): Promise<boolean> {
    try { return (await fetch(`${this.baseUrl}/v1/models`, { signal: AbortSignal.timeout(3_000) })).ok }
    catch { return false }
  }
}
