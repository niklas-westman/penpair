# @penpair/docker

## 0.8.0

### Minor Changes

- 6622bcd: Add hierarchical offline CLI help with stable topic IDs, search and structured
  JSON discovery. First-party adapters ship static help manifests, read without
  executing adapter code. Help remains usable with missing or malformed config.
  
  Stream export, shots, baseline and release-copy capture phases on stderr using
  `--progress human|json|off` (default human). `--json` still prints one final
  CommandResult on stdout; progress no longer becomes result warnings. Library
  callers may receive structured `onProgress` events while retaining `onStep`.
  
  Before unfamiliar work, read `penpair help TOPIC`; start a design iteration with
  one representative frame before a full capture. Wrappers should inherit stderr,
  parse the entire final stdout JSON and check exit/completeness. Avoid `tail -N`
  and buffered subprocess stderr; use `tee` with `pipefail` when recording logs.
  
  Release copy announces source preparation and run ID before journaled writes,
  including per-frame progress. Preparation alone does not establish a journal or
  a resumable paste. Release/map skills describe manual transfer, cheap probes,
  frame batches and exact-byte WebP evidence. `wake --reload` warns about unsaved
  work before dispatch and retains the warning in JSON; saved state is not verified.
  
  Native map import can reuse byte-identical proposal outputs on a rerun while
  preserving changed existing evidence and writer locks. Changed proposals require
  a new output path; stale temporary filenames do not block a new import.

### Patch Changes

- Updated dependencies [6622bcd]
  - @penpair/core@0.8.0

## 0.7.0

### Minor Changes

- e7046b3: Stable sandbox layout source, explicit flush-root refusal, filter cardinality and clearer diagnostics
  
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

### Patch Changes

- Updated dependencies [e7046b3]
  - @penpair/core@0.7.0

## 0.6.0

### Minor Changes

- 229c152: `penpair export --frames ID=NAME,... --page PAGE` exports several frames in one command and keeps going after a failed frame. `--cache` skips frames whose content fingerprint, scale and output file are unchanged.
- 229c152: `doctor --debug-port` and `wake` list the browser tabs on the Penpot origin and which one holds the pinned file. `wake --reload` reloads that one tab and waits for the plugin. Writer-lock errors name the holding run, operation, process and command. `penpair locks` lists local writer locks and `penpair locks clear` removes those whose process is gone.
- 229c152: Flush and layout failures now say what was pending: queued binds and styles, nodes sampled, the slowest bind and time per phase. The 30,000 ms budget maximum is named in the refusal, and malformed layout geometry names the offending shape.
- 229c152: New `@instances` kit (`--include @kit --include @instances`): `pp.swap` keeps position, texts and sizing, `pp.iconSize` scales nested shapes, `pp.componentName` returns the path with the name, and `pp.libraryIcon` places and recolours a library icon.
- 229c152: `penpair queue run jobs.json` runs an ordered list of journaled `run-file` jobs one at a time, with retries that resume uncertain runs, an optional `wake` after a lost connection, a saved status record and one status line per job. `penpair queue status` shows it offline.
- 229c152: `run-file` now checks layout only at the `layoutRoots` its inspect script reports, instead of sampling the whole page. A run with no roots reports the layout check as skipped, with the reason. `--layout-scope page` keeps the whole-page sample as an opt-in audit.
- 229c152: A journaled write whose readback already holds is reported as `already-satisfied` (with a warning and a `skipped` mark in the journal) instead of a verified write. Readback scripts now receive `CFG.inspection`, the inspection from before the write.
  
  The command result's own `outcome` is `already-satisfied` too (exit code 0), so a script that reads only the outer result does not mistake it for a write.
- 229c152: `penpair repair --page PAGE --empty-shapes` finds shapes without an id on the page root and, with `--apply`, asks Penpot to remove them, then recounts independently. A failed removal is reported, not claimed.
- 229c152: `run-file --stages N` runs a write script once per stage (`CFG.stage`), each stage a journal step that resumes from where it stopped. A stage is never skipped because its readback already passes.

### Patch Changes

- 229c152: Republishing a journey or integration map over an older drawing no longer exceeds the 90 KB snippet limit: the publish write carries a digest of the inspected projection instead of the projection. A raw `radius` value in the build kit now lists the active radius tokens.
- Updated dependencies [229c152]
- Updated dependencies [229c152]
- Updated dependencies [229c152]
- Updated dependencies [229c152]
- Updated dependencies [229c152]
- Updated dependencies [229c152]
- Updated dependencies [229c152]
- Updated dependencies [229c152]
- Updated dependencies [229c152]
- Updated dependencies [229c152]
  - @penpair/core@0.6.0

## 0.5.0

### Patch Changes

- Updated dependencies [e4a5061]
  - @penpair/core@0.5.0

## 0.4.1

### Patch Changes

- Updated dependencies [0086bb7]
- Updated dependencies [0086bb7]
  - @penpair/core@0.4.1

## 0.4.0

### Patch Changes

- Updated dependencies [75c0b2d]
  - @penpair/core@0.4.0

## 0.3.7

### Patch Changes

- Updated dependencies [1abd96a]
  - @penpair/core@0.3.7

## 0.3.6

### Patch Changes

- Updated dependencies [412ae50]
  - @penpair/core@0.3.6

## 0.3.5

### Patch Changes

- Updated dependencies [7ce3748]
  - @penpair/core@0.3.5

## 0.3.4

### Patch Changes

- Updated dependencies [9c91bfd]
  - @penpair/core@0.3.4

## 0.3.3

### Patch Changes

- Updated dependencies [6f26260]
- Updated dependencies [6f26260]
  - @penpair/core@0.3.3

## 0.3.2

### Patch Changes

- @penpair/core@0.3.2

## 0.3.1

### Patch Changes

- Updated dependencies [17366ab]
  - @penpair/core@0.3.1

## 0.3.0

### Minor Changes

- c2e52d6: Explain metadata-only token snapshot staleness and explicit ownership migration. Bound doctor origin/transport/fresh execution checks and report each readiness layer with challenge and file/page evidence.

### Patch Changes

- Updated dependencies [c2e52d6]
- Updated dependencies [c2e52d6]
- Updated dependencies [c2e52d6]
- Updated dependencies [c2e52d6]
- Updated dependencies [c2e52d6]
- Updated dependencies [c2e52d6]
- Updated dependencies [c2e52d6]
- Updated dependencies [c2e52d6]
  - @penpair/core@0.3.0

## 0.2.0

### Patch Changes

- Updated dependencies [a5566ed]
- Updated dependencies [a5566ed]
  - @penpair/core@0.2.0
