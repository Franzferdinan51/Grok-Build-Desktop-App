# Providers and local-model policy

## Grok Build — coding backend

Grok Build owns coding-agent execution. The desktop app invokes its documented headless mode:

```bash
grok -p "Review this project" --cwd /path/to/project --output-format streaming-json
```

The app may add documented flags only:

- `--model <model>` when a configured model is selected.
- `--reasoning-effort high` when reasoning is enabled.
- `--yolo` only after the user enables auto-approve tools.
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

## Why no fake multi-provider buttons

The first scaffold advertised Codex/OpenAI choices that had no connected execution backend. They were removed from the executable UI. New providers must supply a real adapter, credential boundary, model discovery, and error handling before they are shown as runnable.
