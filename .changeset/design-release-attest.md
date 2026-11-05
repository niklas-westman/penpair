---
"@penpair/core": minor
---

`design-release attest --release VERSION` proves that `release/VERSION` equals its sources from Penpot's stored data, with no rendering: 95 frames in about 9 seconds. With `--write --by --note` it records the owner's words and a hash per board in `design/releases/VERSION.attestation.json`; running it again says `already-attested` or names the boards that changed. Needs the personal access token.
