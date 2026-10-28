---
"@penpair/core": minor
"@penpair/web": minor
"@penpair/docker": minor
"penpair": minor
"@penpair/marwes-ui": minor
"@penpair/reflection-check": minor
---

`run-file --stages N` runs a write script once per stage (`CFG.stage`), each stage a journal step that resumes from where it stopped. A stage is never skipped because its readback already passes.
