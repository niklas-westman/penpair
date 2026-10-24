---
name: penpair-design-release
description: Prepare and verify a Penpair design release in the pinned Penpot file. Use to assemble reviewed journeys, integration maps and fidelity-checked native screens into release/<product-version> for later implementation.
---

# Design release

Read [the detailed workflow](references/workflow.md) for coverage, review and
recovery boundaries.

Freeze evidence for a reviewed design package while keeping implementation
verification separate. The explicit product SemVer is independent of the
installed Penpair package version. Do not bump or publish npm packages here.

1. **Plan.** Read the reviewed journey and integration contracts, exact source
   screen identities and complete inspections. Check hashes, required cases,
   unknowns and blockers. Use `design-release` help for plan/assemble/verify/
   finalize/check/context arguments. Store working release records in the
   project's design folder, never inside installed skill folders.
2. **Assemble.** Preview the owned `release/<version>` page in the same pinned
   file. Apply only within the owner's authorized scope. Compile snippets, keep
   each below 90 KB, and retain pinned snapshot, one idempotent write and
   independent readback. Assemble the overview/maps, then guide native
   copy/paste of the selected source frames. Do not detach, redraw from images,
   normalize geometry, or switch auto height to fixed height. No cross-file
   transfer or unsupported clone fallback.
3. **Verify transfer.** Record explicit source-to-target root IDs, derive child
   correspondence from ordered topology/type and independently verify native
   fields, dependencies, overrides, tokens, assets and remapped interactions.
   Unobservable required fidelity remains blocking. Read the linked workflow's
   current limits: component override state, missing mask observations and
   unknown text ranges can block selected screens entirely. After uncertain paste,
   inspect candidates and reconcile receipts before any retry. Inspect stable
   source/target exports twice and compare exact dimensions and pixels.
4. **Review evidence.** Keep immutable inspections/images and exact hashes.
   New baselines default to static lossless WebP; keep existing PNG approvals
   unchanged unless explicit migration goes through normal exact-byte review.
   Source image approval does not approve a newly copied target identity. Map
   review, image approval and release review are distinct.
5. **Finalize.** Present the verified release candidate and record only actual
   supplied owner words for its exact hash. Save immutable evidence before the
   guarded remote release marker, independently verify that marker, then publish
   the local finalized pointer. Reconcile a partial journal; do not claim a
   transaction across the local filesystem and Penpot. Mutable native objects
   can drift through shared components/tokens after release.
6. **Hand off.** Check saved artifacts and, when requested, live drift. Emit
   bounded approved context with scope and truncation explicit. Design release
   finalization does not accept implementation: keep it `not-assessed` until
   actual application evidence exists. Continue with `penpair-handoff`, followed
   by `penpair-verify` for real browser work.

Report **Changed**, **Validated**, **Risks**. A disconnected editor permits local
preparation and tests, not claims of native transfer or live visual proof.

See the [design-release guide](https://github.com/niklas-westman/penpair/blob/main/docs/design-releases.md).
