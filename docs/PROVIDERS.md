# Providers and local-model policy

## Grok Build — coding backend

Grok Build owns coding-agent execution. The desktop app invokes its documented headless mode:

```bash
grok -p "Review this project" --cwd /path/to/project --output-format streaming-json
```

The app may add documented flags only:

- `--model <model>` when a configured model is selected.
- `--reasoning-effort high` when reasoning is enabled.
- `--always-approve` only after the user enables auto-approve tools.
- `--resume <session-id>` when session continuation is implemented.

Reference: [Grok Build headless mode](https://github.com/xai-org/grok-build/blob/main/crates/codegen/xai-grok-pager/docs/user-guide/14-headless-mode.md).

## LM Studio and API models — Grok Build's catalog

LM Studio is a first-class **Grok Build model provider**, not a separate agent path. Configure it as a custom OpenAI-compatible `[model.<name>]` entry in `~/.grok/config.toml`; Grok Build then exposes it through `grok models` and the desktop model picker passes that model id to `grok --model`.

The same mechanism supports other API providers. The applications never invent a second provider runtime: every selection is still a Grok Build CLI task.

### Model-load policy

1. Check the server’s loaded model state before asking it to load anything.
2. Reuse a suitable loaded model.
3. Never load multiple models speculatively or duplicate an already loaded embedding model.
4. Treat catalog entries as installed files, not proof that a model is in VRAM.

The apps read Grok Build's model catalog and never issue LM Studio load/unload calls. This prevents the desktop UI from becoming another source of accidental model churn.

## First-class provider presets

All providers remain **Grok Build model targets**: selecting one always runs the same Grok Build CLI task, never a second agent runtime.

| Provider | Endpoint shape | Credential boundary |
| --- | --- | --- |
| LM Studio | user-configured OpenAI-compatible `/v1` endpoint | optional server key via an `env_key` |
| ODS | ODS's local OpenAI-compatible inference endpoint (`/v1`) | local server token, if enabled, via an `env_key` |
| MiniMax | MiniMax's OpenAI-compatible API endpoint | MiniMax API key via an `env_key` |
| OpenAI-compatible | Any user-supplied OpenAI-compatible `/v1` endpoint | Provider key via `OPENAI_COMPATIBLE_API_KEY` |

Both desktop settings pages can edit the base URL and model ID for these entries. They update only the `GROK BUILD DESKTOP MANAGED PROVIDERS` section of `~/.grok/config.toml`; hand-written configuration outside that block is preserved.

Create a model entry in `~/.grok/config.toml`, then it appears in `grok models` and both desktop pickers:

```toml
[model.ods-local]
model = "your-loaded-model-id"
base_url = "http://localhost:11434/v1"
name = "ODS Local"
api_backend = "chat_completions"
env_key = "ODS_API_KEY" # omit if ODS auth is disabled

[model.minimax]
model = "MiniMax-M2.7"
base_url = "https://api.minimax.io/v1"
name = "MiniMax"
api_backend = "chat_completions"
env_key = "MINIMAX_API_KEY"
```

ODS defaults vary by platform and install; confirm its active endpoint in the ODS dashboard before saving the model entry. The desktop apps must not install, start, or load an ODS model implicitly.

## Why no fake multi-provider buttons

The first scaffold advertised Codex/OpenAI choices that had no connected execution backend. They were removed from the executable UI. New providers must supply a real adapter, credential boundary, model discovery, and error handling before they are shown as runnable.
