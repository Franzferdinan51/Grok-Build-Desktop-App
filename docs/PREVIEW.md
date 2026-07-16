# Live coding preview

The optional live preview keeps a running web app visible beside the Grok Build conversation. Enable it in **Settings → Live coding preview**, then use **Preview** in the chat header to open or close the rail without interrupting the coding session.

## Workflow

1. Start the project's development server in the integrated terminal.
2. The app detects local HTTP URLs printed by the command and opens the preview automatically when enabled.
3. Enter a different HTTP(S) URL in the preview location field when detection is not possible.
4. Switch between desktop, tablet, and mobile widths, reload the frame, or open it in the system browser.

The saved URL and enabled state persist locally. The desktop app does not start, stop, or otherwise own the project's development server.

## Security boundary

Preview content runs in a sandboxed iframe. The frame can execute the target application's scripts and forms, but it cannot access Electron or Node APIs. External browser handoff accepts HTTP(S) URLs only. Workspace filesystem access remains behind the existing path-containment and symlink protections.

This workflow is adapted from the Apache-2.0 preview patterns in [dyad-sh/dyad](https://github.com/dyad-sh/dyad); no Dyad Pro code or branding is included.
