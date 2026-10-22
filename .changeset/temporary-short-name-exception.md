---
"@penpair/core": patch
---

Allow an explicit, temporary PENPAIR_RELEASE_EXCLUDE_PENPAIR=true publishing
exception for the blocked short name. Keep all package versions in lockstep,
verify every other package and clearly report the omitted wrapper. Removing the
exception restores full-family publishing and explicit catch-up recovery.
