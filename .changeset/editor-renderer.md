---
"@penpair/core": minor
---

Faster renders.

- `export --frames … --renderer editor --debug-port PORT` captures each frame from the open Penpot tab instead of asking the exporter: 95 frames took 1 min 50 s instead of 8 min 34 s. The image is byte-checked by two matching captures, labelled `renderer: editor-screenshot`, cached apart from exporter images, and never used by approvals or baselines. The editor's viewport and window size are restored afterwards.
- The copy pixel check and copy evidence now render through the shared render service (concurrent rounds, a deadline, and a stalled render ends with the unfinished frames named).
- `--cache` reads its fingerprints in a few calls of up to 25 frames instead of one call per frame: an unchanged rerun of 95 frames takes 7 s.
