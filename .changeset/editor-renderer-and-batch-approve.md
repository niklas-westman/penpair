---
"@penpair/core": minor
---

Faster renders and approvals.

- `export --frames … --renderer editor --debug-port PORT` captures each frame from the open Penpot tab instead of asking the exporter: about a second per frame instead of 5–10 s. The image is byte-checked by two matching captures, labelled `renderer: editor-screenshot`, cached apart from exporter images, and never used by approvals or baselines. The editor's viewport and window size are restored afterwards.
- `approve --page PAGE --frames FILE.json` previews approval evidence for a list of frames rendered together; with `--write --note --by` one set of owner words records every frame, and nothing is written unless every frame rendered, stabilised and matched its case.
- The copy pixel check and copy evidence now render through the shared render service (concurrent rounds, a deadline, and a stalled render ends with the unfinished frames named).
