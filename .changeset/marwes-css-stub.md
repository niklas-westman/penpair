---
"@penpair/core": patch
"@penpair/docker": patch
"@penpair/marwes-ui": patch
"@penpair/reflection-check": patch
"@penpair/web": patch
"penpair": patch
---

`penpair marwes tokens snapshot` loads Marwes 1.5.0 and project theme files in plain Node: a `.css` import in the Marwes module graph no longer stops it (an on-demand loader hook answers it with an empty module).
