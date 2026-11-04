---
"@penpair/core": minor
---

Make a native copy land on the page root and never go silent after the paste.

- Fix: Penpot pastes into the board under the last pointer position it saw, so a cursor left over a board nested the copy inside it, and the wait for new page roots then never ended (ten minutes of silence, no receipt). The viewport is now moved to empty canvas and the clipboard transport puts the pointer at the middle of the canvas just before it pastes.
- A paste that lands inside another board anyway is reported as `status: "misplaced"` within seconds, naming each pasted board and the board it sits in. Nothing is moved or deleted, and it is never reported as `copied`.
- Every stage after the paste reports progress (`paste`, `identify`, `backend wait`, `structure check`, `pixel check`) and has its own deadline. A stage that runs out of time ends the run as `status: "uncertain"` with `stage` and `seen` (the new root boards and the selection at that moment).
- New `design-release copy --find-pasted RUN_ID` (and MCP `design_release_copy_recover` with `action: "find-pasted"`): read-only, lists a run's pasted boards at any depth with the board each sits inside, because a listing of the page roots looks unchanged when the paste was nested. `--abandon` now points to it.
- `design-release copy` exits 3 for `misplaced` and `uncertain`, as it did for `incomplete`.
