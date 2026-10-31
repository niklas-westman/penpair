# @penpair/marwes-ui

## 0.10.0

### Minor Changes

- 675b630: Nine correctness and packaging fixes found by reviewing the architecture contracts against the code
  
  Replaying an already-satisfied Marwes token push no longer fails. Pushing the
  same plan twice — after a resume, or from a stale plan — used to abort with
  `theme exists` as an *uncertain* outcome, and token names already present were
  counted as failures. `marwes-create-theme` is now idempotent, attaching only the
  wanted sets it finds missing and never removing one, and `marwes-add-tokens`
  reports already-present names as `skipped` rather than `failed`.
  
  `penpair run` now refuses a project snippet whose body cannot parse, instead of
  sending it to Penpot and failing inside the editor. A project snippet is code
  from outside the core; it was validated only when someone ran
  `penpair snippets check`. Built-in snippets are unaffected.
  
  The local lifecycle commands now check what the instance runs on before they do
  anything. `penpair up`, `down` and `status` run the local profile's preflight
  first, so a stopped Docker reports "Docker is not running. Start Docker Desktop"
  rather than a raw daemon error from whichever subcommand happened to run.
  `penpair doctor` is deliberately exempt — diagnosing a stopped daemon is what it
  is for. Scaffolding a configuration still works with Docker stopped, because
  `init` writes files and needs no daemon.
  
  `penpair reflection plan` no longer drops a mapped baseline that has no
  implementation route. A frame without a route is exported but never checked,
  which is deliberate — but naming one in the mapping is a request to check it, and
  that request was disappearing from both the case list and the pending list while
  the plan still reported itself complete. It is now reported as pending with its
  own reason.
  
  `@penpair/docker` now ships `docs/` and `examples/`, as `@penpair/web` already
  did, so someone who installs the Docker command gets the same documentation.
  Relatedly, the packaging step no longer replaces a package's own README with the
  project one — only a package that maintains no README of its own receives it, and
  the repository's own design records are excluded from the published tarball
  because they are contributor history rather than product documentation.
  
  Every package now ships the `LICENSE` file it declares in `files`. Five of the
  six promised one and did not include it, so those tarballs carried no licence
  text. A test now fails the build if a package promises a file it does not ship,
  or ships a `LICENSE` that differs from the repository's.
  
  Internal: the convention examples now execute the adapter-command template
  rather than only type-checking it; `skills/` is gated by the code-path naming
  check like every other code root; and the doctor row for a skipped browser-tab
  census is a named function with a unit test, rather than an object literal inside
  a command path that cannot be tested without git.
- 675b630: `penpair-guide`, a skill for someone who does not know where to start
  
  The guide reads the project (pinned file, pages, approvals, release status), says
  in plain words which phase it is in and proposes exactly one next step, handing the
  work to the skill that owns it. It never approves a design, writes to the file or
  finishes a release; approval stays the owner's actual words.
  
  The common path it follows is now written down in `docs/project-lifecycle.md`: a
  `Mood` page for references, one Penpot page per site page, `Desktop` (1440),
  `Tablet` (768) and `Mobile` (390) frames derived from the approved desktop frame, and a
  release the guide proposes when every page is approved and leaves for the owner to
  decide. `penpair-construct` now says explicitly that a device-size frame is derived
  from the approved desktop frame of the same page.
  
  A test keeps the guide a pure entry point: it routes to every phase's skill and no
  skill routes back to it, so the order it describes never becomes a dependency.
- 675b630: The ten shipped skills now state what each one owns, and two are renamed
  
  **`penpair-design-release` is now `penpair-release`, and `penpair-recipes` is now
  `penpair-construct`.** Both old names misled. "Release" meant a Penpot design
  release and an npm publication, and the skill opened by disclaiming the second.
  "Recipe" meant three different things — a kit recipe in shipped code
  (`RecipeInfo`, the `recipes` command), a default composition for a screen
  archetype, and that skill — and the skill held none of the recipes its name
  claimed; the compositions live in `design-judgment`. An existing project that
  installs over an older one is told about the leftover folder rather than left
  with two copies: `penpair skills install` reports it with the new name to move
  to. The `design-release` command is unchanged, so the `penpair-release` skill
  drives a command that keeps its old name.
  
  **Every skill opens with a `## What this owns` section** giving one purpose line
  and naming the neighbour that owns the adjacent work. Before this, two skills
  claimed the same work, one instruction appeared in three files, and the skill
  that owns composition decisions was referenced by no other skill — it existed
  only in an install list. Reading any one skill now tells you where its
  responsibility stops.
  
  **Cross-references say which direction they go.** A link is marked `Next:` when
  work flows there once this skill's work is done, or `Requires:` when it produces
  this skill's input. Previously both read as identical prose, which is why the
  skill set looked like a cycle; the successor edges are now acyclic and a test
  keeps them that way.
  
  **Duplicated instructions are gone.** The composition instruction is stated once,
  in `design-judgment`, and the skills that need it point there. The shared
  CLI-help preamble stays in each skill that needs it standalone, but a test now
  asserts the five copies are byte-identical to one fixture, so they cannot drift
  apart.
  
  **Two new documentation pages.** `docs/glossary.md` defines the seven words that
  meant two or three things each — revision, recipe, verify, contract, design,
  successor, prerequisite — citing the guide that owns a term rather than
  redefining it. `docs/skills.md` is generated from the skills themselves and
  asserted byte-for-byte, and is now the only maintained list of which skills
  exist; six pages that each kept their own list, two of them with counts that had
  been wrong for several releases, link to it instead.
  
  **`penpair-verify` now says when it may fix a mismatch itself.** The step told
  the agent to fix mismatches "within scope" and never defined the scope, so the
  boundary with `penpair-handoff` had no stopping rule. It now fixes only where the
  approved reference, mapping and case already exist, the change stays in the
  component's markup or styling, and nothing new is added, and it recaptures at
  most twice. Anything else is reported as outside the skill. A check fails if a
  skill again says "within scope" without defining it.
  
  Internal: six checks plus a cycle check and routing coverage enforce all of the
  above, each one landed only after its failure was observed. Two of those checks
  were found to be passing while testing nothing before that step caught them.

### Patch Changes

- 675b630: First-run polish found by installing the published package in an empty project
  
  `penpair doctor` no longer reports a bare "the MCP endpoint points at another
  Penpot" when the address came from the assistant's own configuration. It now
  names that source (`claude-config` or `codex-config`) and says to run
  `penpair connect`, which stores this project's own address and takes precedence.
  
  `penpair --help` opens with the five commands that set a project up, in order,
  above the full command list. `--all` and `--search` are unchanged.
  
  The README and installation guide now say the guides assume a Mac or Linux
  computer.
  
  The Penpot path to the MCP address is corrected everywhere it is written (guides,
  setup skill, `init` and `connect` messages, error text): profile image, Your
  account, Integration, toggle MCP on, copy the URL.
- Updated dependencies [675b630]
- Updated dependencies [675b630]
- Updated dependencies [675b630]
- Updated dependencies [675b630]
  - @penpair/core@0.10.0

## 0.9.0

### Minor Changes

- a731b98: Add native delta design-release plans and reviewed adoption, with a complete frozen inventory of changed and retained Penpot frames, immutable predecessor evidence, live continuity verification and per-frame baseline pages. Existing single-page configuration and schema-1 releases remain readable.
  
  Add evidence-derived release status and a state-aware `penpair-design-release` skill with agent routing, explicit recovery guidance and separate design and implementation checkpoints. Copied targets need their own approval; historical references without verifiable owner evidence require actual review. After native copy, refresh overview links through an explicit assembly preview/apply before verification.
  
  Add a native batch comparison bridge using public pinned-engine CLI/report APIs, exact release inventory binding and independently observed evidence. Custom providers remain supported. Native capability and capture/comparator parity must be established before replacing an adopting project's existing provider; installing an engine alone does not establish those guarantees.
  
  Add the opt-in `penpot-native-export-v1` capture policy (`--capture-policy` on `approve` and `baselines`) for Penpot sandboxes that hide the browser. The strict default is unchanged; the profile binds into new approval fingerprints and never promotes earlier approvals. Release status now reports partial assemblies whose map journals are failed or absent.
  
  Multi-page capture changes generated snippets. Preserve existing journal compatibility checks: older runs may require inspection and a fresh reviewed plan rather than resume. No saved or offline check implies current live Penpot or application freshness.
  
  Make auto layout the stated default for everything built or generated in Penpot. The `penpair-design` auto-layout reference now opens with the rule, covers generated output and points to two new Penpot API traps (`resize()` fixes sizing; `fill` on a board is rejected by fidelity). The release, diagram, journey-map and integration-map skills point to it.

### Patch Changes

- Updated dependencies [a731b98]
  - @penpair/core@0.9.0

## 0.8.1

### Patch Changes

- 934635a: Resolve baseline frame IDs directly instead of recursively scanning the entire
  page. Large release pages no longer exhaust the 10,000-shape listing budget
  before capturing explicitly selected frames. Both initial selection and the final
  source recheck use direct lookup. Mixed name/ID configurations retain top-level
  name matching without traversing descendants. Missing IDs do not fall back to
  names; revision, approval, fresh-capture and atomic-publication guards are retained.
  
  No budget flag or configuration migration is required: existing `frameId` entries
  use the corrected selection automatically.
- Updated dependencies [934635a]
  - @penpair/core@0.8.1

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

- c2e52d6: Observe page IDs instead of sleeping after navigation, serialize same-client collections, restore the starting page after structural snapshots, and provide optional lease/revision journal traces without relaxing revision conflicts.
- c2e52d6: Add deterministic, bounded offline theme projections with ordered sets, aliases, composite values and explicit unknowns. Share resolution with mode verification and expose tokens preview without changing global selections or claiming native per-frame theme bindings.

### Patch Changes

- c2e52d6: Explain metadata-only token snapshot staleness and explicit ownership migration. Bound doctor origin/transport/fresh execution checks and report each readiness layer with challenge and file/page evidence.
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
