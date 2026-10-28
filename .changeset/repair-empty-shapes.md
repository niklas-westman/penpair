---
"@penpair/core": minor
"@penpair/web": minor
"@penpair/docker": minor
"penpair": minor
"@penpair/marwes-ui": minor
"@penpair/reflection-check": minor
---

`penpair repair --page PAGE --empty-shapes` finds shapes without an id on the page root and, with `--apply`, asks Penpot to remove them, then recounts independently. A failed removal is reported, not claimed.
