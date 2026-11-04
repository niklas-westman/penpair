---
"@penpair/core": minor
---

Make `design-release copy --apply` work against Penpot 2.18+ and fast enough for a real release.

- Fix: the clipboard validator accepts shapes wrapped in Transit's `~#shape` tag, so a valid copy no longer times out.
- Clipboard works while another app has focus (focus emulation), and errors now say what is wrong: lost focus, denied permission, or the session deadline.
- New `--diagnose --debug-port PORT` (read-only report of focus, permission and readability; with `--apply` it traces every stage) and `--abandon RUN_ID --reason TEXT [--destination-inspected]`.
- A run that never pasted no longer blocks later copies. After a paste the tool keeps asking while the editor is busy, retries stale or timed-out reads, and releases the writer marker when cancelled.
- Verification accepts what Penpot really returns: `fill` board sizing, null constraints inside groups and auto layouts, group masks, vector paths compared relative to the board, component instances checked by identity (reported as a caveat), and float noise in sizes. Pixels within 0.05 % of a frame and 16 per channel count as matching, and the measured difference is always in the receipt.
- Speed: one render per frame and side, with a settled double render only for a pair that differs; renders and inspections run concurrently. 14 heavy frames went from never finishing to under 6 minutes, and the result's `render` field records the route each pair took.
- Faster, stronger verification with an optional Penpot personal access token (`PENPAIR_PAT_TOKEN`, environment or git-ignored `.env.local`): structure is read from the backend's stored data (one request per page) and compared attribute by attribute, including component references and overrides. 14 heavy frames went from about 340 s to about 100 s. New `--evidence auto|backend|plugin` and `--verify-pixels all|sample|none` (default all); the result names the route (`evidence`), what was compared by pixels and how long the backend trailed the editor. Without a token nothing changes except the items above.
- When only sizes and positions differ (Penpot recomputes automatic layouts while pasting), the result says so and what to do. A few localised pixels on hairline strokes are accepted when the stored data is identical.
- Reads before the paste ask again while the editor is busy; the conflict message after an unfinished run names `--resume` and `--abandon`.
