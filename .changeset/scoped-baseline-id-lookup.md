---
"@penpair/core": patch
"@penpair/web": patch
"@penpair/docker": patch
"penpair": patch
"@penpair/marwes-ui": patch
"@penpair/reflection-check": patch
---

Resolve baseline frame IDs directly instead of recursively scanning the entire
page. Large release pages no longer exhaust the 10,000-shape listing budget
before capturing explicitly selected frames. Both initial selection and the final
source recheck use direct lookup. Mixed name/ID configurations retain top-level
name matching without traversing descendants. Missing IDs do not fall back to
names; revision, approval, fresh-capture and atomic-publication guards are retained.

No budget flag or configuration migration is required: existing `frameId` entries
use the corrected selection automatically.
