---
"@penpair/core": minor
"@penpair/docker": minor
"@penpair/web": minor
"penpair": minor
"@penpair/marwes-ui": minor
"@penpair/reflection-check": minor
---

Stable sandbox layout source, explicit flush-root refusal, filter cardinality and clearer diagnostics

`pp.flush({ root })` now refuses an explicitly falsy root before layout or queued
styles/bindings, naming the received value. A selector that matched nothing can
no longer silently widen this flush to the whole page. If page scope is
intentional, omit the key: `pp.flush()` or `pp.flush({ timeoutMs: 10000 })`.
Valid roots and root arrays remain supported; direct `pp.settle(undefined)` keeps
its page default. A rejected root leaves queues available for a corrected flush.

Generate sandbox layout policy from the shared TypeScript implementation instead
of runtime `Function.toString()`. Source tests, built imports and installed kits
now preserve identical source bytes/hashes without increasing the existing size
limits. The hello-card example returns flush layout, phase timings and slowest
binding when it actually builds; an already-built result does not invent timings.

The `@instances` kit gains `pp.find(root, filter, expected)`. It resolves
descendants by name or predicate and refuses unless the match count equals
`expected` (default 1), naming the filter and the count, so the fault stops where
it is written. Use it to resolve a subtree before passing it to
`pp.flush({ root })`, and read `layout.rootIds` from the flush report to confirm
the scope.

`penpair doctor` no longer prints a plain green "MCP transport" row beside a
failing editor check; that row is marked as a warning instead. A browser tab
census skipped for want of `--debug-port` is now reported as a warning rather
than omitted silently. Neither changes `doctor`'s exit code.

`penpair probe` now reports whether the pinned Penpot build exposes
`waitForLayoutUpdate` on a shape, alongside the existing file-level check.
