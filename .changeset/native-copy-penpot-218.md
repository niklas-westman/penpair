---
"@penpair/core": patch
---

Fix `design-release copy --apply` against Penpot 2.18+: the clipboard validator now accepts shapes wrapped in Transit's `~#shape` tag, so a valid copy no longer times out. Add `design-release copy --diagnose --debug-port PORT` (read-only report of focus, clipboard permission and readability; with `--apply` it traces every stage), `--abandon RUN_ID --reason TEXT` for runs that never pasted, and distinct errors for a lost tab focus, a denied permission and the session deadline. A run that never reached the paste fence no longer blocks later copies, and the tool waits briefly for the editor tab to gain focus.
