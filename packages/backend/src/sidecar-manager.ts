/**
 * backend/sidecar-manager.ts
 *
 * Re-exported from packages/desktop/src/main/sidecar.ts for use in the
 * desktop process. This module is the canonical location.
 *
 * Protocol: JSON-RPC 2.0 over stdio.
 *   - Grok CLI headless mode: `grok --headless --stdio`
 *   - Request: `{ jsonrpc: "2.0", id: 1, method: "agent/start", params: { workspace: "path" } }`
 *   - Response: `{ jsonrpc: "2.0", id: 1, result: { sessionId: "..." } }`
 *
 * Source: https://github.com/xai-org/grok-build (grok CLI headless mode)
 */

export { GrokSidecarManager } from "../../desktop/src/main/sidecar"
export type { GrokSidecarStatus } from "../../desktop/src/main/sidecar"
