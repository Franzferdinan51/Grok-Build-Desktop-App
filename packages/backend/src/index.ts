/**
 * backend/index.ts — Backend package entry point
 *
 * Exports the provider abstraction and sidecar manager for use
 * in the Electron main process.
 */

export {
  GrokSidecarManager,
  type GrokSidecarStatus,
} from "./sidecar-manager"

export {
  LMStudioProvider,
  GrokProvider,
  CodexProvider,
  type AIProvider,
  type ModelInfo,
  type CompletionChunk,
  type ToolCall,
  type CompletionOptions,
  type ChatMessage,
  type ToolDefinition,
} from "./providers"
