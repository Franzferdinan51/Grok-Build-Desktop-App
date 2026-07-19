---
name: browser-automation
description: >
  Safely browse, verify, and interact with web pages using the configured
  BrowserOS/browser-control helper.
---

<!-- GROK_BUILD_DESKTOP_BUNDLED_SKILL -->

# Browser automation

Use the verified browser helper when a site needs JavaScript, login state, or
visual confirmation. Run its `status` preflight first, then open only the
requested HTTP(S) URL. Treat exit code 0, JSON `ok:true`, and observed page
state as success. Never claim a page was opened from an empty or unverified
command result. Never kill or replace the user's normal browser profile.

Ask before submitting forms, sending messages, purchasing, deleting, or
changing account settings. Do not extract passwords, cookies, or session
tokens into chat, files, logs, or commits.
