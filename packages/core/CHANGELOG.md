# @penpair/core

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

## 0.5.0

### Minor Changes

- e4a5061: Add an experimental native board-copy workflow for new or existing Penpot release pages. Preview direct page/frame selections, then explicitly apply through a local browser debugging connection with paste fencing, source preservation, independent readback and stable render evidence. Expose the same bounded operation through the write-enabled MCP toolset and document CLI/MCP package discovery.

## 0.4.1

### Patch Changes

- 0086bb7: Allow scoped layout observation with repeatable `--layout-root` and an explicit
  `--layout-max-nodes` budget. Record roots, sampled node counts and partial
  coverage in layout evidence so large pages can proceed to independent readback.
  Document the tested cross-page copy limitation of the Penpot plugin API.
- 0086bb7: Add an explicit loopback browser wake command for the pinned Penpot file, followed by a fresh read-only readiness check. Report plugin suspension and upstream heartbeat age in doctor without treating activation as sustained keep-alive or replaying uncertain writes.

## 0.4.0

### Minor Changes

- 75c0b2d: Add reviewed journey and integration contracts, editable Penpot map projections, proposal reconciliation and design release pages with guided native screen assembly, immutable evidence and drift checks. Draw compact workflow cards with semantic vector icons, short summaries and separate full descriptions. Keep design agreement and implementation verification separate, and ship focused map and release skills.
  
  Save new design baselines as static lossless WebP using shared exact-byte capture and approval handling. Preserve existing PNG references and approvals unless explicitly migrated through review.

## 0.3.7

### Patch Changes

- 1abd96a: Publish package batches with up to three workers and verify npm visibility concurrently. Pin publication and explicit recovery to the reviewed release SHA so feature merges can continue, retain pending release jobs, and refuse recovery that would move a newer latest tag backward. Preserve whole-family checks, owner approval, OIDC/provenance and explicit partial-release recovery.

## 0.3.6

### Patch Changes

- 412ae50: Allow less than 0.01 CSS px of Penpot frame-size noise per axis when validating baseline case geometry, case approvals and offline coverage. Preserve raw design dimensions in provenance and exact scaled PNG-size checks; real size mismatches still fail.

## 0.3.5

### Patch Changes

- 7ce3748: Remove host-side function-constructor evaluation from layout settling and parse snippet syntax without executing it. Require all four behavior hints on each MCP tool definition, mark offline evidence tools as closed-world, and verify annotations through MCP tool discovery in both write modes.

## 0.3.4

### Patch Changes

- 9c91bfd: Support baseline frameId UUIDs for frames nested inside section boards, with bounded page searches, expected-name rename protection and direct frame-ID case approval. Preserve top-level name-only matching.

## 0.3.3

### Patch Changes

- 6f26260: Offer recommended assistant-guided and manual installation routes with the same
  readiness checks. Teach setup skills to honor the chosen route, preserve progress
  when switching and keep manual instructions separate from executed verification.
- 6f26260: Consolidate installation and repair into one canonical setup skill. Preserve the
  old guide URL as a redirect, report legacy copies for safe migration, reuse existing
  Copilot skill folders and support host-specific offline discovery checks for Codex,
  Claude Code and GitHub Copilot without duplicating the installed skill pack.

## 0.3.2

No changes in this release.

## 0.3.1

### Patch Changes

- 17366ab: Add actionable task-to-skill routing to installed project instructions while
  preserving owner text, selected skill scope and project-owned facts.
  Clarify ordinary-language task triggers and validate skill frontmatter with a
  bounded data-only YAML parser, including quoted and folded descriptions.
  Ship a focused frontend verification skill with real browser evidence, image
  inspection and repair guidance, and correct stale provider-starter documentation.
  Add a project-owned comparative checkpoint template so approved references,
  preserved regions, actual visual findings and next actions survive handoffs.
  Add offline Codex skill discovery/routing diagnostics and a realistic invocation
  trial matrix without connecting to Penpot, executing providers or changing files.
  Include Codex display metadata and explicit starting prompts for all six skills,
  with implicit invocation enabled and visible workflow-selection guidance.

## 0.3.0

### Minor Changes

- c2e52d6: Share bounded auto/native/geometry settling between the SDK and build kit. Expose --layout on run-file, export and shots, with three complete geometry observations after a bounded native fallback.
- c2e52d6: Explain metadata-only token snapshot staleness and explicit ownership migration. Bound doctor origin/transport/fresh execution checks and report each readiness layer with challenge and file/page evidence.
- c2e52d6: Observe page IDs instead of sleeping after navigation, serialize same-client collections, restore the starting page after structural snapshots, and provide optional lease/revision journal traces without relaxing revision conflicts.
- c2e52d6: Add deterministic, bounded offline theme projections with ordered sets, aliases, composite values and explicit unknowns. Share resolution with mode verification and expose tokens preview without changing global selections or claiming native per-frame theme bindings.

### Patch Changes

- c2e52d6: Make companion adapters visible during setup and design-to-frontend handoff.
  Recommend Reflection Check for frontend verification, document matching-version
  installation and registration, and distinguish installed adapters from approved
  references and real browser/provider readiness. Update shipped skills and adapter
  guidance without adding automatic dependencies or claiming a bundled browser.
- c2e52d6: Preserve page-session serialization when queued callers cancel, reject malformed layout/readiness evidence, and bound browser animation-frame observations.
- c2e52d6: Establish consistent readable source formatting and checked contributor examples.
  Split implementation comparison planning, validation, image I/O and command handling
  into focused modules while preserving public imports and evidence approval rules.
- c2e52d6: Group installed help by the complete design-to-implementation workflow, add first-frame composition guidance, and document layout fallback, metadata migration, readiness and snapshot recovery.

## 0.2.0

### Minor Changes

- a5566ed: Add guarded design execution, recovery journals, structured inspection and handoff,
  token reconciliation, explicit case coverage, owner approvals and project MCP tools.
  Add the optional implementation comparison adapter, safer credential storage and
  advisory audits. Document live acceptance gates that remain pending.
  
  Prepare reviewed, whole-family release PRs with Changesets and trusted publishing.
  All six packages move together; no live restore, human trial or native component
  override proof is claimed by this release note.

### Patch Changes

- a5566ed: Allow an explicit, temporary PENPAIR_RELEASE_EXCLUDE_PENPAIR=true publishing
  exception for the blocked short name. Keep all package versions in lockstep,
  verify every other package and clearly report the omitted wrapper. Removing the
  exception restores full-family publishing and explicit catch-up recovery.
