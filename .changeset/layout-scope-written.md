---
"@penpair/core": minor
"@penpair/web": minor
"@penpair/docker": minor
"penpair": minor
"@penpair/marwes-ui": minor
"@penpair/reflection-check": minor
---

`run-file` now checks layout only at the `layoutRoots` its inspect script reports, instead of sampling the whole page. A run with no roots reports the layout check as skipped, with the reason. `--layout-scope page` keeps the whole-page sample as an opt-in audit.
