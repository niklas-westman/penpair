---
"@penpair/core": patch
---

Make `design-release copy --apply` work against Penpot 2.18+ and fast enough for a real release.

- Fix: the clipboard validator accepts shapes wrapped in Transit's `~#shape` tag, so a valid copy no longer times out.
- Clipboard works while another app has focus (focus emulation), and errors now say what is wrong: lost focus, denied permission, or the session deadline.
- New `--diagnose --debug-port PORT` (read-only report of focus, permission and readability; with `--apply` it traces every stage) and `--abandon RUN_ID --reason TEXT [--destination-inspected]`.
- A run that never pasted no longer blocks later copies. After a paste the tool keeps asking while the editor is busy, retries stale or timed-out reads, and releases the writer marker when cancelled.
- Verification accepts what Penpot really returns: `fill` board sizing, null constraints inside groups and auto layouts, group masks, vector paths compared relative to the board, component instances checked by identity (reported as a caveat), and float noise in sizes. Pixels within 0.05 % of a frame and 16 per channel count as matching, and the measured difference is always in the receipt.
- Speed: fewer renders per frame, and renders and inspections run concurrently; 14 heavy frames went from never finishing to about 7 minutes.
