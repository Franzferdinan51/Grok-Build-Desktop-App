# Hermes Desktop upstream import

This directory vendors the Electron desktop source from
[`NousResearch/hermes-agent`](https://github.com/NousResearch/hermes-agent),
including `apps/desktop` and its small shared package, imported on 2026-07-15.

Hermes Agent is MIT licensed. The original `LICENSE` is retained in this
directory. The source is the canonical cross-platform design and engineering
base for Grok Build Desktop's Electron target; the Grok Build Desktop app must
not launch, bundle, or depend on Hermes Agent as its coding backend.

## Adaptation boundary

The Electron implementation takes these proven desktop patterns from Hermes:

- tested backend discovery and readiness probes;
- hardened Electron main/preload/renderer boundaries;
- project → folders/repositories/worktrees/sessions information architecture;
- chat/coding rail, file browser, review pane, preview pane, settings, and
  connection-switching UX;
- packaging for macOS, Windows, and Linux.

Grok Build replaces the Hermes runtime at that boundary. The supported coding
transport is the documented Grok Build headless command:

```text
grok -p <prompt> --cwd <workspace> --output-format streaming-json
```

No Hermes credential, gateway, cloud, or agent runtime is shipped by Grok Build
Desktop.
