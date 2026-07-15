# OpenClaw upstream import

This directory vendors the macOS application foundation from
[`openclaw/openclaw`](https://github.com/openclaw/openclaw), commit
`b18f1a8ecda188f9440b8b2f1791a84179dd3560` (imported 2026-07-15).

OpenClaw is MIT licensed. Its original `LICENSE` and
`THIRD_PARTY_NOTICES.md` are retained beside this file. Changes made by this
project are additive and live in the same source tree so the native app can be
rebased against upstream deliberately.

## Product boundary

The imported macOS application supplies the desktop shell and information
architecture: dashboard, channels, skills, schedules, approvals, settings, and
gateway health. It is **not** the coding-agent backend in this project.

`GrokBuildBackend.swift` and `GrokBuildCodingView.swift` add the coding surface.
They invoke the documented Grok Build headless command directly:

```text
grok -p <prompt> --cwd <workspace> --output-format streaming-json
```

No undocumented JSON-RPC or ACP protocol is assumed. LM Studio stays an
operator-controlled local endpoint; this native layer never loads a model.
