# @penpair/reflection-check

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

### Minor Changes

- 75c0b2d: Add reviewed journey and integration contracts, editable Penpot map projections, proposal reconciliation and design release pages with guided native screen assembly, immutable evidence and drift checks. Draw compact workflow cards with semantic vector icons, short summaries and separate full descriptions. Keep design agreement and implementation verification separate, and ship focused map and release skills.
  
  Save new design baselines as static lossless WebP using shared exact-byte capture and approval handling. Preserve existing PNG references and approvals unless explicitly migrated through review.

### Patch Changes

- Updated dependencies [75c0b2d]
  - @penpair/core@0.4.0

## 0.3.7

### Patch Changes

- 1abd96a: Accept static lossless WebP comparison evidence alongside legacy PNG, preserving exact dimensions, original-byte hashes and approval identity. Save lossless WebP by default in the browser provider with a project-pinned encoder and decoded-pixel verification. Reject lossy/animated WebP and malformed containers; existing PNG design approvals remain unchanged.
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

- c2e52d6: Ship a neutral real-browser provider example with actual setup readback, loaded font faces, hover/occlusion guards, deterministic CSS-pixel clipping and additive capture metadata. Keep browsers project-owned and retain owner review and exact baseline approval requirements.

### Patch Changes

- c2e52d6: Make companion adapters visible during setup and design-to-frontend handoff.
  Recommend Reflection Check for frontend verification, document matching-version
  installation and registration, and distinguish installed adapters from approved
  references and real browser/provider readiness. Update shipped skills and adapter
  guidance without adding automatic dependencies or claiming a bundled browser.
- c2e52d6: Establish consistent readable source formatting and checked contributor examples.
  Split implementation comparison planning, validation, image I/O and command handling
  into focused modules while preserving public imports and evidence approval rules.
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
