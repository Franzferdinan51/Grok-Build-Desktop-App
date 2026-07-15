# Provider Configuration

Grok Build Desktop supports multiple AI providers. All providers implement a common interface (`AIProvider`) so the UI is provider-agnostic.

**Source for provider abstraction:** `packages/backend/src/providers.ts`

---

## Provider Matrix

| Provider | Auth | Tool Calls | Streaming | Local |
|----------|------|------------|-----------|-------|
| **xAI Grok** | API Key (env) | ✅ | ✅ (SSE) | ❌ |
| **LM Studio** | None (local) | ❌ | ✅ (SSE) | ✅ |
| **OpenAI Codex** | API Key / OAuth | ✅ | ✅ (SSE) | ❌ |
| **OpenAI GPT** | API Key | ✅ | ✅ (SSE) | ❌ |

---

## 1. xAI Grok (Primary)

### How it works

The Grok CLI runs as a sidecar process (`grok --headless --stdio`). The Electron main process communicates with it via **JSON-RPC 2.0 over stdio**.

### Binary Installation

```bash
# Official installer (recommended)
curl -fsSL https://x.ai/cli/install.sh | bash

# Or from fork
git clone https://github.com/Franzferdinan51/grok-build /tmp/grok-build
cd /tmp/grok-build
cargo build -p xai-grok-pager-bin --release
# Binary: target/release/xai-grok-pager (ship as `grok`)
```

### Authentication

The Grok CLI authenticates via the `XAI_API_KEY` environment variable, or interactive browser flow on first launch:

```bash
export XAI_API_KEY="xai-..."
# Then run the CLI
grok --version
```

> Source: https://github.com/xai-org/grok-build
> File: `crates/codegen/xai-grok-pager/docs/user-guide/02-authentication.md`

### CLI Config Snippet

```json
// ~/.config/grok-build/config.toml (auto-generated, do not edit)
[api]
key = "$XAI_API_KEY"  # resolved from env at runtime

[models]
default = "grok-3"

[sandbox]
enabled = true  # Sandboxed file operations
```

### IPC Communication (from renderer)

```typescript
// Get status
const status = await window.api.grok.status()
// → { running: true, pid: 12345 }

if (status.running) {
  // Send JSON-RPC request
  const result = await window.api.grok.send("agent/start", {
    workspace: "/path/to/project",
  })

  // Subscribe to streaming events
  const unsub = window.api.grok.onEvent("message", (data) => {
    console.log("Grok says:", data)
  })
}
```

### Protocol Details

Grok's headless mode uses **ACP (Agent Client Protocol)** over stdio:

> Source: https://github.com/xai-org/grok-build
> Files: `crates/codegen/xai-grok-mcp/src/acp_transport.rs`

```json
// Example: Start a session
{ "jsonrpc": "2.0", "id": 1, "method": "agent/start", "params": { "workspace": "/Users/me/myproject" } }
{ "jsonrpc": "2.0", "id": 2, "method": "chat/send", "params": { "content": "Explain this code" } }

// Stream response
{ "jsonrpc": "2.0", "method": "chat/token", "params": { "delta": "Grok 3 is " } }
{ "jsonrpc": "2.0", "method": "chat/token", "params": { "delta": "xAI's " } }
{ "jsonrpc": "2.0", "method": "chat/done", "params": { "usage": { "total": 142 } } }
```

---

## 2. LM Studio (Local, First-Class)

### Why First-Class?

LM Studio is a local-first priority — no API key, no internet required, full privacy. Default endpoint is the local network address `http://100.116.54.125:1234`.

### Setup

```bash
# Download LM Studio from https://lmstudio.ai
# Start LM Studio, load a model (e.g., Llama 3.3 70B)
# Enable "API Server" from the LM Studio UI
# Default: http://localhost:1234

# For local-only: http://localhost:1234
# For network access to another machine: http://<IP>:1234
```

### Config Snippet

```json
// Stored in electron-store
{
  "providers": {
    "lmstudio": {
      "provider": "lmstudio",
      "baseUrl": "http://100.116.54.125:1234",
      "enabled": true
    }
  }
}
```

### HTTP API (OpenAI-Compatible)

LM Studio exposes the OpenAI Chat Completions API:

```bash
# List models
curl http://100.116.54.125:1234/v1/models

# Chat completion (streaming)
curl http://100.116.54.125:1234/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "local-model",
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": true
  }'
```

### Provider Code

> Source: `packages/backend/src/providers.ts` — `LMStudioProvider` class

```typescript
const provider = new LMStudioProvider("http://100.116.54.125:1234")

// List available models
const models = await provider.listModels()
// → [{ id: "llama-3.3-70b", name: "Llama 3.3 70B", ... }]

// Streaming completion
for await (const chunk of provider.complete({ messages: [{ role: "user", content: "Hi" }] })) {
  process.stdout.write(chunk.delta)
}
```

---

## 3. OpenAI Codex (OAuth / API Key)

### Setup (OAuth flow)

Codex uses OpenAI's OAuth 2.0 flow. The app opens a browser window for the user to authorize, then receives an OAuth token.

```bash
# Register your app at https://platform.openai.com/apps
# OAuth callback: grokbuild://auth/callback
```

### Config Snippet

```json
// Stored in electron-store (encrypted)
{
  "providers": {
    "codex": {
      "provider": "codex",
      "authType": "oauth",
      "clientId": "your-openai-client-id",
      "enabled": true
    }
  }
}
```

### API Usage

```bash
# Direct API call
curl https://api.openai.com/v1/chat/completions \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "Write a hello world in Python"}],
    "stream": true
  }'
```

### Provider Code

> Source: `packages/backend/src/providers.ts` — `CodexProvider` class

```typescript
const codex = new CodexProvider(process.env.OPENAI_API_KEY)

// Check connectivity
const ok = await codex.ping()

// List available models (GPT-4o family)
const models = await codex.listModels()

// Streaming completion
for await (const chunk of codex.complete({
  messages: [{ role: "user", content: "Fix this bug" }],
  tools: [ReadFileTool, EditFileTool, BashTool],
})) {
  process.stdout.write(chunk.delta)
}
```

---

## 4. OpenAI GPT (API Key)

Standard OpenAI API key-based access for general-purpose GPT-4o reasoning.

### Config Snippet

```json
{
  "providers": {
    "openai": {
      "provider": "openai",
      "apiKey": "sk-...",
      "baseUrl": "https://api.openai.com",
      "enabled": true
    }
  }
}
```

---

## Model Discovery

Each provider implements `listModels()`:

```typescript
interface AIProvider {
  listModels(): Promise<ModelInfo[]>
}

type ModelInfo = {
  id: string       // provider-specific model ID
  name: string     // human-readable name
  contextLength: number   // context window size
  supportsTools: boolean  // tool call support
  supportsVision: boolean // image input support
}
```

> Source: `packages/backend/src/providers.ts` — `ModelInfo` type

---

## Adding a New Provider

1. Add a new class in `packages/backend/src/providers.ts` implementing `AIProvider`
2. Register it in `packages/desktop/src/main/store.ts` provider schema
3. Add UI in `packages/desktop/src/renderer/App.tsx` model picker
4. Document config snippet in this file

---

## Provider Selection in the UI

The model picker in the empty state lets users switch between providers:

```typescript
// packages/desktop/src/renderer/App.tsx
<For each={PROVIDERS}>
  {(p) => (
    <button
      class={`model-picker__option ${activeProvider() === p.id ? "model-picker__option--active" : ""}`}
      onClick={() => setActiveProvider(p.id)}
    >
      <span>{p.icon}</span>
      <span>{p.label}</span>
    </button>
  )}
</For>
```

Provider preference is persisted via `window.api.store.set("activeProvider", id)`.
