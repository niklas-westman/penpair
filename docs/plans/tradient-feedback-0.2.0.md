# Tradient feedback: execution plan

Created: 2026-10-22. Status: **runtime implementation planned; adapter-discovery documentation delivered separately**.

Goal: make the ordinary Penpair workflow complete the observed trial without a custom SDK host, then reduce the project glue needed for comparison and theme previews.

Source: `feedback-0.2.0-2026-10-22.md` and its linked evidence in Tradient's `docs/penpair/`. The original report is outside this repository; phase 0 records a redacted, portable reproduction here. No consumer files are changed by this plan.

## Defaults and constraints

- Cover all eight findings in phases. Milestone A is reliability; milestone B is comparison and preview capability. Use `codex/tradient-feedback`, with small verified commits. Milestone boundaries permit review; they do not authorize pushes, merges or publication.
- Live acceptance uses a dedicated disposable copy, confirmed by its public file ID. No file has been selected or authorized by this plan. Until then, implement and test offline and leave the live boxes unchecked. Do not repurpose Tradient's existing file or its other pages implicitly.
- Keep the core neutral. Library recipes, ownership migration and library-specific previews belong in adapters. Tradient's screen, trading data and theme names remain consumer-owned.
- Retain file pins, one-shot writes, independent readback, uncertain journals and exact-artifact approval. Geometry stability is not pixel approval, font readiness or native component parity.
- No token changes, native component generation, whole-file restore claim, two-person acceptance claim or edits to the adopting application are implicit in this work.
- Preserve compatible public interfaces and result envelopes. Add optional evidence fields rather than renaming existing fields or changing their meaning. New commands/options require matching help, schemas where applicable, and negative parsing tests.
- Use Changesets for release notes. All six repository package versions move together; the existing publishing exception may still skip only the unscoped wrapper. Do not bump versions during implementation.

## Repository and validation

Baseline inspected: `main` at `57f9782`, all six packages at **0.2.0**. pnpm **10.12.1**, TypeScript **5.6.3**, Vitest **3.2.4**. Tests live in each package's `test/` directory. There is no repository lint script.

| Purpose | Command |
| --- | --- |
| Build, types, tests and package-version/config rules | `pnpm check` |
| Six tarballs installed and exercised in clean consumers | `pnpm smoke:package` |
| Fast version/config guard | `pnpm check:versions` |
| Targeted regression | `pnpm --filter PACKAGE exec vitest run test/FILE.test.ts` |
| Whitespace | `git diff --check` |

Run the relevant targeted suite while developing each phase, then `pnpm check` before committing it. Run package smoke after changes to shipped commands, adapters, skills/examples or dependencies and at final handoff. Do not substitute fake-provider tests for a real-browser acceptance result.

Planning validation (2026-10-22): 73 existing targeted tests passed across core, adapter and comparison packages; the version/config guard, local document links and single-Now rule passed. Full `pnpm check` and package smoke were not rerun for this documentation-only change. These baseline results do not verify the proposed fixes or any live acceptance gate.

### Completion protocol

Check a task only when its stated output is built and verified. Record offline and live status separately. Keep exactly one `Now` in `PLAN.md`; update it and the change log with each completed phase. If evidence changes the diagnosis, update this guide before implementing a different solution.

After every phase, append a report below with **Resolved / Changed / Validated / Risks / Next**, date, commit, commands/results, and links to reviewed evidence. For investigations, distinguish **investigated** from **resolved**. A blocked live check never becomes a passing checkbox through elapsed time or synthetic evidence.

## Milestone A — reliable default workflow

### Phase 0 — reproduce and preserve the baseline

- [x] Record the feedback version, package/agent/runtime versions and the relevant reproduction sources. Extract only credential-free minimal fixtures; do not copy the whole consumer runner or unreviewed logs.
- [x] Run the existing layout/kit, migration, doctor, coordination and structural-snapshot suites. Record pre-existing failures separately.
- [x] Add failing regressions before behavioral changes: native wait times out while geometry is stable; metadata-only snapshot migration; delayed own-lease save versus a real external edit; page switching delayed past the initial read.
- [x] Prepare a public-ID-only scratch fixture manifest with two pages, one flex/text/token example and expected preservation checks. Keep credentials and private journals ignored.

Tests: core `settle-integration.test.ts`, `kit.test.ts`, `external.test.ts`, `coordination.test.ts`, `journal.test.ts`, `structure-snapshot.test.ts`; adapter `migration.test.ts`, `commands.test.ts`.

Exit: the confirmed layout and migration failures reproduce in controlled tests. PP-07/08 fixtures state which behavior is confirmed and which causal claim still needs live tracing. Lack of a live target does not prevent phase 1.

### Phase 1 — bounded layout fallback (PP-01, P1)

Entry points: `packages/core/src/layout.ts`, `kit-source.ts`, operation settling and stable export callers.

- [x] Extend `LayoutOptions` and kit `settle`/`flush` options with `strategy: auto | native | geometry`, default `auto`. Add `--layout auto|native|geometry` to `run-file`, `export` and `shots`; omit any unverified `off` mode. Existing SDK `layout:false` stays an explicit advanced-caller contract, not a suggested CLI workaround.
- [x] Use one shared policy definition for host and kit behavior. Preserve existing total deadlines; cap an automatic native attempt at the smaller of **500 ms** and **one quarter of the remaining budget**. Leave time for geometry fallback rather than spending the full deadline on native waiting.
- [x] In `auto`, fall back after an unsupported native API or an observed native wait failure when execution and target identity remain valid. A lost transport response, cancellation, changed target, malformed data or exhausted budget must not become success or trigger a write replay.
- [x] Require three consecutive complete, equal geometry samples in geometry mode, with stable IDs/hierarchy and finite measurements; use the existing host/kit poll intervals. Duplicate IDs, cycles, truncation and node-budget excess refuse. In `native`, propagate native failure without fallback.
- [x] Add optional attempt diagnostics to `LayoutResult`: selected strategy, native outcome, fallback reason and elapsed time. Preserve `stable`, `method` and `samples` meanings. Report verification failure after a partial flush through the existing journal/readback path.

Tests: successful native path; unsupported/timed-out native with stable geometry; continually moving geometry; malformed/truncated samples; changed file/page; cancellation/deadline; bindings recorded only after valid settling; equivalent host/kit policy; CLI option rejection; stable PNG export still requires independent matching renders.

Exit: core `native-api`, `settle-integration`, `kit`, `kit-integration`, `run-file`, `export` and `shots` tests pass, followed by full checks/package smoke.

- [ ] **Live acceptance:** the shipped CLI and kit build the small scratch example, verify actual bindings and produce two stable exports without a consumer SDK runner. Repeating retains owned IDs and adds no duplicates. Look at the images; record native/fallback evidence.

### Phase 2 — explain upgrades and prove readiness (PP-02/03, P2)

- [x] Add additive snapshot-check reason codes for missing snapshot, schema migration, missing ownership, content drift and metadata/hash mismatch. A stale result must always include a reason, even when the value diff is identical. Preserve stale/error exit-code distinctions.
- [x] Reuse the existing `tokens migrate --from FILE --ownership FILE` preview and `--out NEW_FILE` write path. Diagnostics must point to that workflow, explain the schema change and request explicit classification of every legacy set. Do not invent ownership or regenerate away original provenance.
- [x] Strengthen the existing doctor execution read rather than creating a duplicate readiness command. Add `doctor --timeout-ms N`, default **5000 ms**, valid **1000–30000 ms**, bounding origin, connection and execution work with cancellation.
- [x] Generate a fresh challenge for the editor to echo with file/page identity. Report origin reachability, transport connection, fresh execution and file-pin match separately, with observed time/duration. Only measured layers may be healthy; unavailable heartbeat/version evidence stays unknown. Extend existing doctor JSON checks additively and keep endpoint redaction.

Tests: adapter `migration`, `commands`, `command-contract`; core `external`, `connect`, `http-client`, `command-result`. Include old schema with unchanged values, missing ownership, invalid map, preserved provenance, stale challenge, wrong file, sleeping editor, timeout and secret-bearing failure text. Migration must require no live connection.

Exit: the retained schema-1 fixture explains its failure and migrates without value/theme/provenance loss; doctor cannot report unqualified readiness from stale or incomplete execution evidence.

- [ ] **Live acceptance:** compare responsive, foregrounded and deliberately disconnected scratch-editor states. Verify a new challenge and useful bounded failure messages. Do not deliberately interrupt a mutation for this test.

### Phase 3 — coordination evidence and page-aware snapshots (PP-07/08)

- [x] Add redacted optional journal trace events around lease acquisition/check/release, inspection and observed revisions. Record source identities and timing without credentials, document text or whole catalogs in logs.
- [x] Reproduce delayed lease persistence separately from external shape/token edits. First make no-op/reconciliation behavior observable; do not replace guards with sleeps or automatically ignore revision differences.
- [x] **PP-07 decision gate:** if causal attribution is proven, fix the ordering of lease acquisition, target capture and inspection so the operation starts from its own independently read post-acquisition revision, while preserving conflict detection during inspection and before mutation. Test an external edit in each interval. If attribution remains unproven, deliver tracing/reproducer and retain PP-07 as unresolved; changing revision policy then requires a separately reviewed plan amendment.
- [x] Replace the fixed page-switch sleep in `runOnPage` with bounded polling of the expected page ID: default **5000 ms**, **100 ms** intervals, limited by the enclosing command's remaining budget. Resolve a unique name once to an ID. A timeout identifies expected/observed page and stage.
- [x] Serialize page-sensitive work on the same client through a shared page-session mechanism. Whole-file snapshots hold that session for the collection, capture pages sequentially, and restore the original visible page in `finally`. Unexpected external navigation causes a clear failure rather than silent mixing.
- [x] Record per-page progress and timings. Preserve the original snapshot manifest on failure; diagnostic partial observations must never be assembled across revisions or published as a complete snapshot. Keep the original error if restoring the visible page also fails, and report both.

Tests: core `coordination`, `journal`, `operation-recovery`, `operation`, `inspection`, `structure-snapshot`; add delayed page-switch and concurrent same-client collector tests. Include duplicate page names, removed pages, manual navigation, mid-capture file/token edits, deadline exhaustion and restoration after failure.

Exit: multi-page fixtures succeed sequentially with correct identities and restore their starting page; failures preserve prior artifacts and identify the exact failed stage. PP-07 is either causally fixed with safety regressions or explicitly still unresolved.

- [ ] **Live acceptance:** idle sequential operations, a controlled external scratch edit and a two-page snapshot. Confirm preservation of token definitions/order, global theme selections and unrelated objects.

### Phase 4 — help and composition guidance (PP-06, P3)

- [x] Adapter-discovery slice: promote both companion roles in the README/setup guides and recommend the comparison adapter in shipped setup/handoff skills, with distinct installation and browser-readiness stages. This independent documentation slice does not complete the runtime help/composition work below.

- [x] Group installed help around connect/diagnose, build, inspect/spec, snapshot/diff, capture/approve and compare. Include examples of actual installed syntax and link to limitations; do not invent new aliases merely to reorganize help.
- [x] Add a short pre-build composition checklist to the design/recipe skills: primary user task, chosen existing reference, hierarchy, useful context, responsive/focus order, and a small first-frame critique before expanding variants. This records a design decision; it does not manufacture owner approval.
- [x] Document migration previews, settling modes, doctor layers and snapshot recovery; remove suggestions to work around these with arbitrary waits.

Tests: core `docs`, `skill-instructions`, `skills`, CLI help assertions and installed-package smoke. Verify instructions survive idempotent installation and no project names enter the neutral core.

Exit: the inspect → spec → snapshot/diff → comparison path is discoverable from installed help; one trial can follow documented commands without reading package source.

## Milestone B — reduce consumer integration work

### Phase 5 — real browser comparison starter (PP-05, P2)

- [ ] Add a neutral example provider under `examples/reflection-browser/` for the existing `ImplementationProvider.runCase` contract. Use the adopter's pinned Playwright installation; no browser dependency or application framework enters the core. Ship it with the existing web documentation/examples mechanism and verify the installed path.
- [ ] Require project hooks for route, fixture, theme, state, capture root and expected fonts. Read actual state and loaded font faces/weights; never echo requested inputs as observed evidence.
- [ ] Park the pointer outside the capture region and verify no relevant hovered controls. Capture with explicit viewport, device scale **1** by default and a root bounding box after scroll/sticky layout settles. Round the box outward to whole CSS pixels and record the rule; do not resize images to improve a metric.
- [ ] Preserve the current schema-1 provider fields. Add optional capture metadata for root/clip, scale, browser version, font evidence and pointer checks; old providers remain readable. The example requires its complete metadata and flags missing evidence instead of substituting defaults silently.
- [ ] Validate paths/hashes and compare through the existing adapter. Retain `owner-review-required`; a pixel score never approves a baseline. Unapproved trial captures may test the capture helper, but the approval gate for `reflection check` stays intact.

Tests: adapter `integration.test.ts` plus new provider/capture fixtures for wrong state/theme, delayed/missing fonts, hover contamination, sticky shell, fractional crop boundaries, unchanged baseline bytes and dimension/scale mismatch. Exercise a real local example in the browser at desktop/mobile × light/dark × loaded/empty; unit stubs alone do not complete this phase.

Exit: an adopter can supply explicit setup hooks and run a genuine comparison without rewriting capture plumbing. No Tradient route/provider is registered by modifying its repository here.

### Phase 6 — explicit, isolated theme previews (PP-04, P2)

- [ ] Record the pinned API's frame-level theme capabilities with links and observed proof. Do not expose native per-frame binding as supported based on an API name or projected appearance.
- [ ] Deliver a deterministic offline preview first: neutral token-projection logic plus adapter command `penpair marwes tokens preview --from SNAPSHOT --theme NAME [--out FILE]`. Resolve the selected declared theme using existing token precedence/alias rules; ambiguous names, missing dependencies or unsupported values produce errors/explicit unknowns.
- [ ] Return a versioned preview with source hash, selected theme/set identities, resolved values/unknowns and `kind: projected-theme-preview`. `--out` writes only a project-bound artifact. It does not mutate Penpot, switch global themes or imply native bindings.
- [ ] Supply a scratch example applying projected color values to owned roots, with projection metadata retained separately from actual typography/spacing/radius bindings. Native frame-mode support remains a separate acceptance gate if it cannot be proved on the pinned version.

Tests: adapter preview/command-contract tests and neutral resolver tests: multiple themes, ordering, aliases/cycles, composite values, ambiguous names and missing values. Before/after scratch checks must show identical global selections, catalog values/order and unrelated objects.

Exit: simultaneous light/dark preview artifacts are reproducible and accurately labeled. Native component anatomy, override preservation and native per-frame color bindings remain unclaimed unless independently proven.

## Final integration and release gate

- [ ] Re-run the eight-case scratch trial using shipped CLI/kit paths, a repeat build and one heading change. Compare IDs, bindings, geometry, native/browser images and changed fields. Record observed timings, unknowns and interventions.
- [ ] Confirm no consumer-side timeout bypass, fixed inter-operation sleep or fabricated provider evidence is needed for the covered paths.
- [ ] Run `pnpm check`, `pnpm smoke:package` and whitespace checks. Record the actual final test count and installed-package results; do not assume the 0.2.0 baseline count remains current.
- [ ] Add Changesets per package behavior: fixes as patch, new public options/provider/preview capabilities as minor. The generated version PR selects the highest bump for every package; no manual version bump or release activation change belongs here.
- [ ] Review the branch, evidence and remaining PP-07/native-mode/live gates. Obtain owner decisions before any push/PR, merge, publish or non-scratch write.

If the scratch target is unavailable, code may be reviewed with live checks still pending, but the release must not claim those checks passed. No rollback or exactly-once guarantee is introduced. On an uncertain write: stop, retain the journal, inspect independently, reconcile only owned changes and resume explicitly. After repeated failure, record the trace and narrow the reproducer; never relax a guard to get a green report.

## Completion tracker and reports

| Phase | Status | Offline evidence | Live evidence | Completed |
| --- | --- | --- | --- | --- |
| 0 Baseline/reproducers | Complete offline | 587 tests; explicit expected-failure reproducers | Target pending | 2026-10-22 |
| 1 Layout | Complete offline | 597 tests; six-package smoke pass | Pending | 2026-10-22 |
| 2 Migration/readiness | Complete offline | 607 tests; six-package smoke pass | Pending | 2026-10-22 |
| 3 Coordination/snapshots | Offline delivery complete; PP-07 unresolved | 614 tests; six-package smoke pass | Pending | 2026-10-22 |
| 4 Help/skills | Partial: companion discovery delivered | 583 tests + package smoke pass for docs/skills slice; runtime work pending | Browser/live acceptance pending | 2026-10-22 (slice) |
| 5 Browser starter | Not started | Pending | Pending | — |
| 6 Theme previews | Not started | Pending | Pending | — |
| Final trial/release review | Not started | Pending | Pending | — |

Append phase reports here during execution. Update the table and relevant `PLAN.md` checkbox in the same verified change.

### 2026-10-22 — Companion discovery (phase 4 documentation slice)

**Resolved:** Readers and agents can now discover why to add the library and frontend-comparison adapters, with Reflection Check recommended when implementing and verifying frontend code.

**Changed:** Added a companion selection/setup/readiness guide, promoted both roles in README and onboarding docs, updated shipped setup/handoff/recipe skills and project-facts guidance, and added a matching-version registration path. Kept adapter dependencies explicit and the browser starter planned. No runtime help/composition or reliability fix is claimed by this documentation slice.

**Validated:** `pnpm check` passes (583 tests), including navigation/anchors, core/skill neutrality and skill installation. All six package smoke installs pass; the command tarball includes the new adapter guide. Added patch changesets for the affected shipped packages.

**Risks:** These guidance changes need the next reviewed release and skill refresh to reach existing installations. Browser verification still requires approved baseline/case evidence and a real provider; automatic bundling/setup was not added. No version bump, push, merge or publish was performed.

**Next:** Phase 0 remains the runtime entry point; phase 5 supplies the real-browser starter. Phase 4's help/composition tasks remain unchecked.

### Phase 0 report — 2026-10-22

**Resolved:** portable, credential-free reproductions now distinguish confirmed defects from suspected live causes. **Changed:** [baseline evidence](../fixtures/feedback-reproductions.md), scratch manifest template, native timeout/metadata/delayed-page expected-failure tests and conservative delayed-revision fixture. **Validated:** existing targeted suites: 55 tests; reproducers: 4 tests; `pnpm check`: 587 tests pass, including three explicitly expected failures. **Risks:** expected-failure tests demonstrate missing behavior; they do not verify fixes. No live target or lease causality proof. **Next:** phase 1 shared layout fallback. Commit: `test: preserve adoption failure reproductions`.

### Phase 1 report — 2026-10-22

**Resolved:** idle native failure no longer blocks the default workflow when independent complete geometry settles. **Changed:** one static host/kit policy, bounded native attempts, three equal hierarchy-aware samples, diagnostics and CLI `--layout`; no write retry. **Validated:** native success/failure/hang, node overflow/cycles, target/transport refusal, kit binding and stable-render tests; `pnpm check` passes 597 tests and six-package smoke passes. **Risks:** geometry is neither visual approval nor font readiness; live CLI/kit build remains pending. **Next:** migration explanations and bounded doctor readiness. Commit: `feat: share bounded layout fallback across host and kit`.

### Phase 2 report — 2026-10-22

**Resolved:** metadata-only stale snapshots now explain schema/ownership/hash causes; transport connection alone cannot prove editor readiness. **Changed:** additive reason codes and existing migration guidance; bounded origin/transport/challenge execution/file-pin layers, timestamps and duration, default 5 s doctor with 1–30 s option. Docker uses the same fresh-read proof. **Validated:** 74 targeted tests, stale/missing challenges, wrong file, sleeping origin/editor, timeout validation and secret redaction; `pnpm check` 607 tests and six-package smoke pass. **Risks:** real background/disconnected editor tests remain pending; heartbeat/version are unknown unless observed. **Next:** coordination trace and serialized page sessions. Commit: `feat: explain migration drift and prove fresh doctor readiness`.

### Phase 3 report — 2026-10-22

**Resolved:** delayed synthetic navigation and overlapping same-client collectors now use observed IDs and serialized sessions, restoring the starting page. **Changed:** page/session guards shared by derived clients, bounded polling, per-page progress and separate restoration errors; optional `--trace --apply` journal lease/revision events (also token pushes). **Validated:** real plugin bodies cover delayed switches, concurrent collectors, manual navigation, removed/ambiguous pages, revision changes, restoration failure and cross-client writer contention; `pnpm check` 614 tests and six-package smoke pass. **Risks:** PP-07 remains **unresolved**: delayed own saves and external edits cannot be causally distinguished with current evidence. Revision guards are unchanged. Live sequential/external-edit tests pending. **Next:** installed help and composition guidance. Commit: `feat: serialize observed page sessions and trace writer revisions`.

- [ ] PP-07 follow-up: obtain scratch trace proving delayed writer-marker persistence, then separately review any change to revision ordering. Tracing and conservative conflict refusal are delivered; no race fix is claimed.

### Phase 4 report — 2026-10-22

**Resolved:** installed help now exposes the full inspect/spec/snapshot/capture/compare workflow; composition guidance catches under-designed first frames before multiplying variants. **Changed:** task-grouped actual command examples, composition checklist in shipped skills, and migration/layout/doctor/snapshot/recovery docs. Corrected old help wording that implied updating an image alone approves it. **Validated:** help, docs, neutral-core and idempotent skill installation tests; `pnpm check` 615 tests and six-package smoke pass. **Risks:** composition remains a human/agent judgment step; a checklist does not establish visual quality or owner approval. **Next:** real-browser comparison starter. Commit: `docs: expose the complete workflow and first-frame composition checks`.
