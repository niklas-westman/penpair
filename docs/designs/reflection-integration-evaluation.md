# Reflection integration: capability, friction and delivery path

## Status and verdict

**Recommendation update, 2026-10-29:** the owner chose native Penpot release
membership, live verification and the engine bridge as the required delivery.
The Projection-first sequencing below is retained as historical evaluation,
not the current implementation recommendation. See the maintained
[design-release guide](../design-releases.md). Projection may support reporting;
it does not replace the native release or its approval/live-verification gates.

**Evaluation, 2026-10-29; no runtime changes implemented.** Sources examined:

- Penpair 0.8.1, commit `9e32620`.
- Sourcer commit `5ff459a`; the inspected comparison/configuration files were
  clean. Its declared and installed standalone `reflection-check` is 0.3.0.
- Standalone Reflection checkout `a33231d`, engine 0.7.0 and
  `reflection-projection` 0.5.0. Both exact versions were independently found on
  the public npm registry during this evaluation.

**Powerful upstream capabilities; cumbersome and incomplete integration today.**
Keep the projects separate, but establish one explicit bridge. Do not maintain a
second general browser/comparison engine inside project scripts, and do not
replace strong capture evidence with declared config values merely to fit a
native report.

This revises the first multi-page proposal: reuse `reflection-projection` for
release composition, historical reference representation, validity, decisions
and immutable bundles. Penpair still owns operational page selection and exact
approval verification; a new Penpair release/carry/bundle system would duplicate
upstream work.

## What actually runs in Sourcer

| Entry | Current path | What a successful result establishes |
| --- | --- | --- |
| `design:compare` | Penpair adapter → `design/browser/run.mjs` → copied provider → Playwright/Pixelmatch | Comparison evidence for eligible configured design cases, subject to the gate limitations below |
| `reflection:*` | Standalone Reflection 0.3.0 → `reflection.config.ts` → `frontend-react`, port 3000 | Legacy-app checks; it does not establish parity for `frontend-evolved` |
| `design:serve` | Fixture-enabled `frontend-evolved`, port 3100 | The app used by the Penpair design provider; fixture validation is distinct from real-auth/end-to-end validation |
| `compare-101.mjs` | Direct provider calls against exported release PNGs | Explicitly measurement-only; no approval verification or reliable failure exit for drift/errors |

The Penpair adapter currently depends on core and `jiti`, not standalone
Reflection. Upgrading `reflection-check` alone cannot alter `design:compare`.
The naming hides two independent comparison paths.

Valuable project behavior must survive consolidation: exact route/origin checks,
reviewed route mappings, fixture/theme/state setup, pre-navigation interception
for email cases, independent DOM observations and font/capture checks. These are
application knowledge, not general engine internals.

## Confirmed findings

### P1: the CI gate can accept an incomplete run

`ci-compare.sh` suppresses comparison nonzero exits so `ci-gate.mjs` can decide
about measured drift. The gate, however, reads only `result.data.cases`. It
ignores the process outcome, envelope completeness, `data.complete`, pending
cases and the expected case inventory.

A read-only reproduction ran the actual gate against a temporary synthetic
report: one complete passing case, one pending Login case, `outcome: incomplete`,
`exitCode: 3`, and completeness false. The gate exited **0** and printed
**“1 of 1 cases pass the gate.”** No app, browser or Penpot was involved.

Fix this before expanding coverage. Preserve the subprocess status, validate the
whole envelope and report kind, require exact expected unique case coverage, and
distinguish complete drift from incomplete/error/cancelled evidence. A deviation
exception must never waive a missing case or failed capture. Partial selection
must be explicit and cannot claim current-product completeness.

### P2: earlier approval needs an audit, not an assumption

All 45 entries in the inspected baseline manifest lacked an embedded
`approved.approval.kind: owner-words` link. That does **not** prove that nobody
approved the design elsewhere. It does show that the selected-reference label
cannot establish the requested earlier per-frame owner approval by itself.

Existing Penpair initial-reference behavior permits capture without owner words;
its planner rejects forced references but accepts some selected references with
no owner-words link. Audit historical approval records and exact image/source/case
identity before importing references as owner-approved. Recover real proof where
available; otherwise preserve the image as legacy/review evidence and keep strict
approval eligibility pending. Never manufacture links or original approval dates.

### P2: exceptions and artifacts are insufficiently bound

Sourcer's exception gate currently matches case ID, the global baseline page and
truthy `approvedBy`. It does not bind the exact reference hash, setup, comparator,
capture policy or a bounded accepted difference; `until` is displayed rather than
evaluated. No conclusion about the current exception being expired was drawn.
Mixed-page baselines also make a global page the wrong identity for an exception.

The provider overwrites deterministic screenshot/diff paths derived from case ID
and setup. Review sheets read those paths and the current baseline manifest.
An older report can therefore show newer evidence. Use run-specific immutable
artifacts, preserve each run's selected reference and hashes, and verify them
when producing a review sheet.

### P2: capture and lifecycle policy are duplicated

The current `runCase` wrapper probes server reachability and launches/closes
Chromium per case. The direct measurement workaround already reuses a browser,
and upstream can execute a batch with one browser and isolated contexts.
This is a concrete structural inefficiency; no wall-time saving was measured.

Sourcer's provider contains reviewed perceptual comparison behavior, routes and
capture changes beyond the copied starter. It also resolves Sharp through core's
dependency layout. Keep project hooks, but move general capture/comparison and
codec ownership to a supported engine/interface rather than copying internals.

## What can be reused upstream

### Standalone Reflection 0.7.0

Public integration is typed config → pinned CLI → validated raw `report.json`.
It supports browser batches, states, custom viewports, PNG/WebP baselines,
explicit visual thresholds, case refs, declared input hashes, report metadata,
browser identity and result hashes.

The package exports `defineReflection`, config/report types, `hashReportInputs`
and `computeResultHash`. It does **not** export its runner, capture/comparison
internals, Target IR compiler or an executable adapter registry. Target IR is an
internal architectural seam, not a public integration API. Avoid deep imports.
`reflection review --json` is a summary, not the raw provenance-bearing report.

### reflection-projection 0.5.0

Reuse its public contracts and Node bundle API for:

- A **full required-case inventory**, including cases without comparisons.
- Independent historical source snapshots and per-comparison snapshot identity.
- Reference artifacts, original baseline hashes, approval representation and
  human/delegated/legacy attestation distinctions.
- Separate proof, readiness, input validity, reference approval and review.
- Content-bound decisions, release diffs and immutable bundles with verified
  readback.

The convenience `projectFromReflectionReport` is deliberately **executed-only**
and assigns no design approval. It cannot establish whole-product coverage or
historical approval. A Penpair-aware provider must build the full inventory and
validate the original approval evidence before emitting approval that holds.

Projection is a representation/validation layer, not a verifier of Penpot
approval fingerprints or live source continuity. Its readiness summary alone
does not enforce owner approval or current inputs. `computeValidity` requires
freshly computed inputs; opening a valid bundle does not prove live freshness.
Decision `carried-forward` means its content binding still matches, not that an
old browser run is current or that a Penpot image acquired a new approval.

## Recommended ownership

| Owner | Responsibility |
| --- | --- |
| Penpair core | Source resolution/capture, exact design approval and operational baseline provenance |
| Penpair comparison adapter | Validated reference composition, case-plan translation, complete-inventory accounting, engine/report bridge and evidence-integrity checks |
| Standalone Reflection | Browser execution, capture/comparison policy, diagnostics and raw run reports |
| reflection-projection | Neutral evidence representation, validity/decision helpers, release views and immutable bundles |
| Sourcer | App routes, setup/fixture hooks, independent state observations, explicit policy choices and owner decisions |

Keep engine/projection dependencies out of neutral core. The integration may
depend on public Projection APIs and require a reviewed pinned engine. No merge
of repositories or fork of the runner is required.

## Critical bridge constraints

1. **Evidence parity:** native route reports do not currently supply all of the
   independently observed application/font context required by Penpair's provider
   contract or all root/clip/pointer/occlusion/layout metadata supplied by the
   current browser provider. The detailed capture block is optional for custom
   providers, but validated when supplied; the shipped exact starter requires it.
   Do not fill observed fields from `meta`, `ref` or requested config. Preserve
   measurements or report the missing proof explicitly.
2. **Capture parity:** explicitly pin viewport, scale, cropping, unique selectors,
   locale/timezone, theme, fonts and animation policy. Native contexts fix scale
   to 1, custom/preset viewports have different full-page defaults, and selector
   capture selects the first match. These are not automatically equivalent to
   Sourcer's unique root and measured outward-rounded clipping.
3. **Comparator parity:** Sourcer uses Pixelmatch 8.0.0; the examined upstream
   lockfile resolves 7.2.0. Both use the familiar 0.1 comparison threshold, but
   equal settings do not prove equal scores. Preserve case thresholds explicitly:
   upstream with no threshold does not fail a same-size diff.
4. **Integrity:** declare the selected manifest, approvals, mapping, hooks/fixtures
   and relevant implementation inputs. Recheck originals and inputs after the
   run; upstream input hashing alone does not freeze them or fail missing inputs.
   Verify raw report, artifact and original approved-byte identities. A decoded
   `expected.png` derivative is not the original approved WebP hash.
5. **Lifecycle and outcomes:** use unique invocation/report directories; native
   run IDs have second precision. Require exact case/ref coverage despite native
   unmatched-filter warnings. Map structured outcomes: Reflection's success,
   blocking and tool-error exits differ from Penpair's success, drift and incomplete
   exits. Review-only drift may exit successfully.
6. **Reference ownership:** Reflection must not update Penpot-owned approved
   images. The bridge should use verified read-only input copies and never invoke
   `reflection update` for them; an upstream externally-managed-reference guard
   would make that boundary clearer.

## Handling the 26 retained cases

Prioritize **explicit composition of approved historical references** from the
existing separate release roots. Select the active reference for each stable
requirement explicitly, retain its original image/approval/source snapshot and
run fresh implementation comparisons against it. Reject conflicting selections
instead of last-writer-wins or name matching.

Use per-case or reference-cohort snapshots. Supersede only references replaced by
the new release: globally superseding the old release snapshot would incorrectly
drop unchanged Login/email proof in Projection's summarization.

This can solve release-delta composition without first replacing all capture
configuration or inventing a generic frozen-carry format. Live multi-page capture
remains a useful separate improvement, and live recapture continuity still needs
the approval-contract work identified in the adjacent design. Historical reference
validity must never be labelled fresh Penpot source verification.

## Delivery recommendation

1. **Close the gate gap:** complete envelope/process-status validation, exact
   inventory accounting, bound exceptions and immutable review artifacts. Add
   negative tests for missing cases, pending cases, capture failure, stale
   exceptions and artifact mutation. This does not depend on an engine upgrade.
2. **Compose the current reference set:** audit earlier owner proof, preserve
   originals and produce a full Projection from older and latest references.
   Missing approval remains visible. Keep measurement-only exports separate.
3. **Run one native bridge pilot:** pin Reflection 0.7.0 and Projection 0.5.0 in
   an isolated evaluation path. Include a verified historical Login case, a new
   candidate case, an intercepted-email case and a deliberate missing mapping.
   Use only public config/CLI/report APIs and inspect actual artifacts.
4. **Close measured-evidence gaps upstream:** where parity requires it, add
   generic independently measured capture diagnostics/state observation and
   externally-managed baseline protection. Do not weaken Penpair validation to
   make a bridge pass. A public runner API is optional future work, not a
   prerequisite for the CLI pilot.
5. **Converge after parity:** one `design:compare` path, one browser lifecycle per
   batch, complete required-case accounting and one immutable review bundle.
   Rename/archive legacy-app smoke checks so a green run identifies the app and
   scope it actually verified. Remove duplicated provider internals only after
   representative and full-matrix comparisons establish equivalence.

Acceptance must include missing/wrong cases, wrong route/state/font, duplicate
capture roots, dimension mismatch, source/baseline mutation, stale app inputs,
partial runs, retained historical references and changed-reference supersession.
Keep thresholds unchanged during migration, repeat captures for stability and
compare on the pinned browser/platform. Owner review and real-auth/end-to-end
verification remain separate from fixture pixel checks.

## Validation and limits

Performed: source inspection across all three projects; exact npm-version
availability checks; isolated execution of the actual Sourcer gate against an
incomplete synthetic report; specialist architecture, tooling, approval/trust and
product review. The synthetic gate bypass was reproduced, not merely inferred.

Not performed: upgrading Sourcer, running a browser/Penpot session, measuring
throughput, establishing comparator parity or validating historical owner words.
No runtime source, thresholds, references or approvals were changed.

Public upstream references: [engine upgrade guide](https://github.com/niklas-westman/reflection/blob/a33231d/docs/upgrading.md),
[engine exports](https://github.com/niklas-westman/reflection/blob/a33231d/src/index.ts),
[Projection contract](https://github.com/niklas-westman/reflection/blob/a33231d/packages/projection/README.md).
