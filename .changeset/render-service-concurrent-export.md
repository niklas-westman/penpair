---
"@penpair/core": minor
---

`export --frames` renders its frames together, four at a time, instead of one after another, through a new shared render service (`renderFrames`). A frame that cannot be rendered is reported and the rest are kept. A render that never answers ends the run with the unfinished frames named, since a timed-out call still holds the editor; run again and `--cache` keeps what was rendered.
