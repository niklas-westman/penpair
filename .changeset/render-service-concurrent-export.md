---
"@penpair/core": minor
---

`export --frames` renders its frames together, four at a time, instead of one after another, through a new shared render service (`renderFrames`). A frame that cannot be rendered is reported and the rest are kept. A render that never answers ends the run with the unfinished frames named, since a timed-out call still holds the editor; run again and `--cache` keeps what was rendered.

`--concurrency 1-8` sets how many frames are rendered at once (default 4). Each Penpot render has a fixed cost of 5–10 s whatever the frame size, but the exporter handles about four at a time: 95 frames took 8.5 minutes at 4 and 15.5 at 8. Keep the default, and use 2 after an "http error" or a stalled run.
