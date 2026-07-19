---
name: desktop-control-lobster
description: Verified desktop and Android control through the Lobster Edition MCP gateway or the local browser/desktop helpers.
metadata:
  grok_build_desktop_bundled_skill: true
  upstream: https://github.com/Franzferdinan51/desktop-control-lobster-edition-skill
---

# Desktop Control — Lobster Edition

This skill adapts the MIT-licensed `desktop-control-lobster-edition-skill` for
the Grok Build Desktop Telegram agent. Grok Build CLI remains the only agent
harness. Use the Lobster MCP gateway when the user has installed and enabled
it; otherwise use the verified local helpers described below.

## Required safety loop

1. Observe first: check the current app/window/page state or take a screenshot.
2. Run the relevant preflight before native UI control.
3. Perform the smallest action that satisfies the request.
4. Observe again and verify the resulting state. Never claim success from an
   empty response, a daemon starting, or an unverified tool call.
5. If `permission_required` is true, report the exact macOS permission needed
   and stop. Do not work around permissions.

Destructive filesystem changes, purchases, external messages/posts, account
changes, credential actions, and anything that leaves the machine require the
Telegram approval gate. Never reveal or commit tokens, cookies, API keys,
private endpoints, or personal data.

## Preferred controls on this Mac

- Browser: `~/.openclaw/workspace/tools/browser-control.sh status`
- Browser navigation: `~/.openclaw/workspace/tools/browser-control.sh open <https-url>`
- Native desktop preflight: `~/.openclaw/workspace/tools/desktop-control.sh status`
- Use the installed Peekaboo/Lobster workflow for native UI actions after a
  successful preflight.
- Never kill or replace the user's normal Chrome process or profile.

Treat exit code 0 plus JSON `ok:true` and an observed post-action state as the
only success signal. If a helper is missing or unhealthy, explain that and ask
for the specific installation or permission needed.

## Lobster MCP gateway

When the user has configured the upstream gateway through Grok Build MCP,
prefer its namespaced tools for screenshots, mouse, keyboard, clipboard,
windows, apps, files, diagnostics, and optional Android/ADB control. The
upstream gateway's `backend_status` and `permissions_check` are read-only
preflights. Do not run its installer automatically from Telegram.

The upstream project documents compatibility aliases, but prefer explicit
names such as `desktop_screenshot`, `desktop_window_list`, and
`desktop_window_activate` so actions remain auditable.

## Provenance

Adapted from `Franzferdinan51/desktop-control-lobster-edition-skill` under its
MIT license. The upstream copyright and license are retained in the Grok Build
Desktop repository's `docs/UPSTREAM-REBASE.md` notice. This bundled skill does
not copy private configuration or credentials.
