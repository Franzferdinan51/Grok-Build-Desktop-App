# Upstream rebase: OpenClaw + Hermes + Z.ai ZCode

## Correct source classification

| Product | Source status | What this project may use |
| --- | --- | --- |
| OpenClaw Desktop | MIT source; native macOS app is Swift, with a separate broader control/gateway architecture | Information architecture: channels, gateway health, approvals, skills, schedules, sessions, node/device surfaces, project-aware context |
| Hermes Desktop | MIT Electron/React source | Code-level patterns for backend resolution/probes, narrow preload APIs, project → repository → worktree → session organization, coding rail, review pane, previews, task interruption, and connection switching |
| Z.ai ZCode | Official product is distributed, but public source for the desktop app was not found | Product/UX reference only: coding cockpit, plan/code/review/deploy flow, GLM integration ideas. No source is copied or represented as open source. |
| Grok Build | Apache-2.0 source | The only coding-agent backend. Its documented headless command and output stream define task execution. |

## Decision

Do **not** put OpenClaw or Hermes behind the app as a second agent runtime. Instead:

1. Use the **Hermes Desktop Electron boundary** as the implementation reference because it matches the cross-platform Electron target.
2. Use **OpenClaw Desktop’s product map** as the feature reference: channel connection, approval visibility, skills, schedules, health, sessions, and eventually nodes.
3. Use **Z.ai ZCode** as a closed-product UX benchmark only.
4. Keep **Grok Build** as the executable coding backend and LM Studio as the local model service.

## First rebase slice in this commit

- Persistent projects replace the previous one-off workspace picker.
- Each project gets an inspected Git state: repository detection, branch, changed-file count, and diff statistic.
- The UI now has a project rail and read-only review pane, directly following the Hermes Desktop project/review model.
- The backend remains a Grok Build task runner, so none of this adds a competing agent.

## Next slices

1. Task/session rail with resume and cancellation using Grok Build session IDs.
2. File/preview pane and safe read-only source navigation.
3. Explicit approvals and tool activity timeline.
4. Skills and scheduled-task surfaces.
5. Telegram allowlist + inbound task handoff, optionally through an OpenClaw gateway bridge.
6. Gateway/device health overview where it helps a coding workflow.

## Attribution

Keep upstream license notices and source links in the repository for any adapted code. This project currently reuses architecture and interaction patterns; it does not vend copies of OpenClaw’s Swift UI or Hermes’ React components.
