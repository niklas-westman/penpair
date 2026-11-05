---
"@penpair/core": minor
---

`export` now reports where its time went. Each single-frame export records layout, stability wait, hashing and, per render, the whole round trip against the time Penpot's own export call took. The figures are printed as one progress line and returned as `timing` in the `export` result.
