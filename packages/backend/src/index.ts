/**
 * backend/index.ts — Backend package entry point
 *
 * Exports provider configuration types. Grok Build execution belongs to the
 * desktop main-process backend, which calls Grok Build's headless interface.
 */

export {
  LMStudioProvider,
  type ModelInfo,
} from "./providers"
