# Cross-platform product contract

Electron is the only maintained desktop implementation. macOS, Windows, and Linux ship from the same source and must expose the same core behavior.

## Required capabilities

- Grok Build headless CLI execution, streaming, cancellation, run history, and session IDs.
- Scratch workspace plus persistent project selection.
- File explorer/editor, project terminal, Git status, and per-file review.
- Grok model catalog with LM Studio and API models in one picker.
- Encrypted provider credentials and editable OpenAI-compatible endpoints.
- Skills, schedules, runtime monitoring, Telegram, and settings.
- Explicit permissions, workspace containment, and no automatic model lifecycle actions.

A navigation item or mock card is not an implementation. Views must refresh their backing data when opened and when the active project changes.

Platform-specific packaging and credential storage may differ internally, but the user path and Grok Build backend contract must remain equivalent.
