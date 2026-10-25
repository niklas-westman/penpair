---
"@penpair/core": patch
---

Allow scoped layout observation with repeatable `--layout-root` and an explicit
`--layout-max-nodes` budget. Record roots, sampled node counts and partial
coverage in layout evidence so large pages can proceed to independent readback.
Document the tested cross-page copy limitation of the Penpot plugin API.
