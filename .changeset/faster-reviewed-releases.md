---
"@penpair/core": patch
---

Publish package batches with up to three workers and verify npm visibility concurrently. Pin publication and explicit recovery to the reviewed release SHA so feature merges can continue, retain pending release jobs, and refuse recovery that would move a newer latest tag backward. Preserve whole-family checks, owner approval, OIDC/provenance and explicit partial-release recovery.
