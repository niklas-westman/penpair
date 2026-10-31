# design-releases

## Overview

The design-release pipeline: plan a release from pinned artifacts, copy its
boards into a destination page in Penpot, verify the copies pixel-for-pixel
against their originals, and finalize an immutable approved bundle.

A release is a record with a status, and the status is the pipeline. Everything
in this directory exists to make the forward transitions safe: a release may
only become `"verified"` on evidence, and only become `"final"` behind an owner
review, an independent check, a revision guard and a readback.

`releaseStatus()` is the authority a caller consults to learn what the next
valid step is. It runs `checkRelease`, assesses implementation, and inspects
open journal runs, returning a schema-versioned `ReleaseStatus` record with a
`step` enum, `completed[]`, `blockers[]`, `design.{valid,finalized,ready}`,
`freshness.scope`, an inventory breakdown, implementation state, `recovery[]`
keyed to journal run ids, and `nextActions[]` whose entries carry a `kind` and
an optional `command`.

## Interface

`index.ts` is the public boundary; files it does not re-export are internal.
Where a symbol below is exported from its file but not re-exported by `index.ts`,
the entry says so. `index.ts` also exports `hashDesignRelease` under the alias
`releaseDesignHash`, and does `export *` from `copy.ts`.

**Schema** (`types.ts`, re-exported wholesale)

| Type | Role |
| --- | --- |
| `DesignReleasePlanInput` | The supplied plan document (`schemaVersion` 1, kind `"design-release-plan"`). |
| `DeltaDesignReleasePlanInput` | A plan that inherits members from a pinned finalized base. |
| `DesignReleaseAdoptionInput` | A standalone adoption plan (kind `"design-release-adoption"`). |
| `DesignRelease` | The authoritative record: `status`, `sources`, `members`, `contracts`, `receipts`, `maps`, `fidelity`, `reviews`, `implementation`, `finalized`. |
| `ReleaseMember`, `ReleaseMemberInput` | A member in the v2 inventory, with `disposition` (`"changed"` \| `"retained"` \| `"adopted"`), source, optional approval and route. |
| `ReleaseArtifactRef` | `{ path, sha256 }` — the content-addressed pointer used throughout. |
| `ReleaseReceipt`, `ReleaseFidelity`, `ReleaseMapEvidence`, `ReleaseOverviewEvidence` | Evidence sub-documents embedded in a release. |
| `ReleaseCheck`, `ReleaseContext`, `ReleaseOptions`, `ReceiptInput` | Operation inputs and outputs. |
| `ReleaseComparisonProof`, `ReleaseComparisonReference` | Comparison identity loaded from immutable release evidence. |

**Status** (`status-types.ts`, re-exported wholesale)

| Type | Role |
| --- | --- |
| `ReleaseStatus` | Schema-versioned status record: `step`, `completed[]`, `blockers[]`, `design`, `freshness`, `inventory`, `implementation`, `recovery[]`, `nextActions[]`. |
| `ReleaseRecovery` | A journal run keyed by `runId` with `inputsMatch` and `resumeEligible`. |
| `ReleaseNextAction` | An entry in `nextActions` with `kind` (`"read-only"` \| `"write-preview"` \| `"approval-required"` \| `"input-required"`) and optional `command`. |
| `ReleaseImplementationStatus` | Implementation assessment: `comparison`, `complete`, `caseIds`, `reasons`. |

**Store** (`store.ts`)

- `planRelease(root, raw, options)` — validates a plan, reads and verifies every
  pinned artifact, returns a new release with status `"planned"`.
- `readDesignRelease(root, file)` — reads and validates a release record.
- `writeDesignRelease(root, file, release, options)` — atomic, lock-guarded
  write.

**Validation** (`validation.ts`)

- `validateReleasePlan(raw)` — SemVer, 1–100 screens and contracts, unique ids.
- `validateDesignRelease(raw)` — full round-trip validation of state, receipts,
  fidelity binding and the finalized pointer.
- `hashDesignRelease(release)` — deterministic content hash, deliberately
  excluding `status`, `reviews`, `createdAt`, `finalized` and `implementation`.

**Assemble** (`assemble.ts`)

- `assembleRelease(client, root, release, options)` — journalled pipeline
  (`"design-release-assemble"`) that creates the destination page, publishes
  map contracts to Penpot, and writes the overview. Moves status to
  `"awaiting-copy"`. Refuses `"verified"` or `"final"` status.

**Copy, verify, check, finalize**

- `copyReleaseBoards(client, root, request, options)` (`copy.ts`) — a three-step
  journalled pipeline (create destination page, clipboard copy and paste,
  arrange) returning `"preview"`, `"copied"` or `"incomplete"`.
- `verifyRelease(client, root, release, inputs, options)` (`verify.ts`) — live
  native-structure and pixel-exact comparison of every screen against its copy;
  writes inspection and render evidence; moves the status to `"verified"`.
  Refuses `"final"` status.
- `checkRelease(client, root, release, options)` (`check.ts`) — offline or live
  integrity check: re-reads every artifact, validates map projections, re-derives
  node maps and decoded-pixel hashes, and re-reads live shapes and renders when a
  client is supplied. Alongside it, `readReleaseBundle(root, release)` reads the
  immutable approved bundle and `releaseReferences(release)` enumerates every
  artifact reference (both exported from `check.ts`, not re-exported by
  `index.ts`).
- `finalizeRelease(client, root, release, review, options)` (`finalize.ts`) — an
  independent check, then the approved bundle, then a `"released"` marker written
  to Penpot, then an independent readback, and only then the local `"final"`
  pointer.

**Context** (`context.ts`)

- `releaseContext(client, root, release, options)` — assembles a size-bounded
  context document for the release.

**Status** (`status.ts`)

- `releaseStatus(root, raw, options)` — validates, runs `checkRelease`, assesses
  implementation, scans open journals, and returns `ReleaseStatus`.
- `releaseRecovery(root, release, designHash)` — returns `ReleaseRecovery[]`
  for any incomplete or partial journal runs keyed to this release (exported
  from `status.ts`, not re-exported by `index.ts`).

**Status evaluation** (`status-evaluation.ts`)

- `evaluateReleaseStatus(release, checked, implementation, options)` — pure
  function that derives a `ReleaseStatus` from pre-computed inputs.
- `releaseCaseIds(release)` — returns the member ids that carry a `route`
  (used to correlate implementation cases).

**Membership** (`membership.ts`, `membership-validation.ts`)

- `adoptRelease(root, raw, options)` — plans a standalone adoption release from
  a `DesignReleaseAdoptionInput`; all members get disposition `"adopted"`.
- `releaseMembers(release)` — returns the frozen member inventory; normalises
  v1 sources into v2 member shape.
- `validateReleaseMembership(root, raw, artifact?)` — rechecks persisted lineage
  against the inheritance chain and change ledger.
- `resolveReleaseMemberChanges(inherited, changes)` — pure function; applies
  add / replace / remove deltas to an inherited member list (exported from
  `membership.ts`, not re-exported by `index.ts`).
- `validateAdoptionPlan(raw)`, `validateReleaseApprovalReference(raw)`
  (`membership-validation.ts`) — parse and validate adoption plan and approval
  reference inputs.

**Comparison** (`comparison-proof.ts`)

- `loadReleaseComparison(root, rawReference)` — loads reviewed comparison
  identity from immutable release evidence.

Supporting modules (internal): `artifact-paths.ts`, `child-journals.ts`,
`context.ts` (internal helpers), `contract-graph.ts`, `copy-evidence.ts`,
`copy-plan.ts`, `copy-snippets.ts`, `fidelity.ts`, `implementation-status.ts`,
`live.ts`, `member-evidence.ts`, `overview-links.ts`, `snippets.ts`.

## Invariants

- **The state machine runs one way.** `"planned"` → `"awaiting-copy"` →
  `"verified"` → `"final"`. `assembleRelease` refuses `"verified"` or `"final"`
  status (`assemble.ts`). `verifyRelease` refuses `"final"` status (`verify.ts`).
  `writeDesignRelease` refuses to overwrite a `"final"` record or to change `id`
  or `productVersion` (`store.ts:54`). `finalizeRelease` requires `"verified"`
  (or `"final"`, as a no-op when not applying).
- **Assemble precedes verify.** `verifyRelease` requires the target page id, the
  overview frame id, the overview itself and all map evidence to exist first.
- **Artifact writes are idempotent by content address.** `saveArtifact` reuses
  an existing file with the same SHA-256 silently and throws if the same path
  holds different bytes. Writes to the release record take a `.write-lock` file,
  released in a `finally` block.
- **Finalization writes the local pointer last.** The remote marker is written
  first, then re-observed independently, and the marker and review hashes must
  match before the local `"final"` pointer is written. The Penpot file revision
  is captured before the check and asserted unchanged immediately before the
  remote write and again before the local write.
- **Approval is cryptographically bound.** `finalizeRelease` requires an owner
  review matching `"design-release"`, the release id, and
  `hashDesignRelease(release)` exactly. Without it, it throws before any write.
- **Both map kinds are required.** `assertReleaseContracts` — at `store.ts:168`,
  called from `planRelease`, `assembleRelease`, `verifyRelease`, `checkRelease`, and the `draft`
  helper backing `adoptRelease` and delta-plan releases — requires at least one
  journey map and one integration map (`store.ts:106-110`). On the finalization path
  every contract and detail contract must additionally carry an exact owner
  review and be ready.
- **Ceilings.** 16 MiB per artifact (`maximumArtifactBytes`) and per native copy
  transfer plan; 100 entries each for receipts, contracts, sources and maps;
  1,000 implementation references; 1–20,000 node-map entries per receipt; 1–100
  screens and contracts per plan.
- **What makes a release invalid**: no fidelity in a `"verified"` or `"final"`
  state; `fidelity.receiptsHash` not matching the observation hash of the
  receipts; receipts not covering every screen; the target frame appearing in the
  screen list; a `finalized` pointer without `"final"` status or the reverse; a
  changed target owner key or name; duplicate screen, receipt or map ids; or
  pixel hashes that differ between the frozen render and the two exports.
- **Every export demands a stable frame.** All export calls pass
  `stable: true`; a first export after a write or a page switch can be stale.
- **Membership lineage is cryptographically bound.** A v2 release with a `base`
  pointer must name the exact finalized bundle (`membership.ts`); the resolved
  member list must match the hash of the inherited membership after applying
  the explicit change ledger. Cyclic or chains deeper than 100 are refused.
  `resumeEligible` is always `false` on recovered journal entries — matching
  saved inputs does not prove current target or step compatibility.

## Side Effects

- **Filesystem**, under `design/releases/<productVersion>/`: `release.json`,
  `approved/bundle.json`, `approved/artifacts/<sha256>.bin`, and screen fidelity
  evidence under `evidence/screens/` (a JSON and a PNG per screen for both the
  original and the copy). Everything goes through `atomicWriteFile` or
  `saveArtifact`; no direct writes.
- **Private evidence** under the gitignored `.penpair/native-copy/<runId>/`:
  the transfer plan, observations of the original and the pasted result, a
  readback, a mapping, a durable paste fence (`paste-attempt.json`) and a
  receipt. The `.penpair/` gitignore entry is ensured before any of it is
  written.
- **Journal files** written under the root by `runJournaledSteps`, keyed
  `"design-release-assemble"`, `"design-release-copy"`,
  `"design-release-finalize"` and `"design-release-overview-links"` (from
  `overview-links.ts`).
- **Penpot**: snippets dispatched through the tool client. Reads inspect the
  native copy, the projection, the journal target and the release observation.
  Writes create the destination page, select, arrange, and write the released
  marker under a revision guard. PNG exports run for screens, maps and the
  overview.
- **Clipboard** only through the explicitly injected transport, and never unless
  applying.
- **Progress** through the optional `onStep(message)` callback; no other stdout
  contract.

## Verification

- Run: `pnpm test` from `packages/core`. The suites covering this directory are
  `test/design-releases.test.ts`, `test/release-status.test.ts`,
  `test/release-membership.test.ts`, `test/release-implementation-status.test.ts`,
  `test/release-child-journals.test.ts`, `test/release-cover.test.ts`,
  `test/release-retained.test.ts` and `test/release-skill.test.ts`.
