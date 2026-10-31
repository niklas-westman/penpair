# maps

## Overview

The map model: the schema for journey maps and integration maps, their
persistence, their deterministic layout, their human-readable renderings, and
the proposal and review lifecycle that governs how one changes.

This directory knows nothing about Penpot. It is pure model and pure filesystem.
The rendering layer is [`../map-penpot`](../map-penpot/EGM.md), and the
dependency runs strictly one way: `map-penpot` imports from here, and nothing
here imports from `map-penpot`. Keeping that direction is what lets the model be
reasoned about, hashed and reviewed without a live design tool.

## Interface

`index.ts` is the sole public boundary.

**Schema** (`types.ts`, re-exported wholesale): `MapKind`, `MapOrigin`,
`MapIcon`, `MapSource`, `MapNode`, `MapEdge`, `MapRequirement`, `MapFinding`,
`MapContract`, `JourneyMap`, `IntegrationMap`, `ArtifactReview`, `MapProposal`,
`MapDrawingNode`, `MapDrawingEdge`, `MapDetailTarget`, `MapDetailContext`,
`MapDrawingPlan`, `MapDrawingBox`, `MapDrawingAnnotation`, `MapContext`.

**Validation** (`validation.ts`)

- `validateMapContract(raw)` — parses and normalises a contract.
- `validateMapDetail(raw)` — validates a linked child contract.
- `hashMapContract(contract)` — deterministic SHA-256 of the normalised form.
- `maxMapBytes` — the 16 MiB per-file budget.

**Store** (`store.ts`)

- `readMapContract`, `writeMapContract`, `readMapProposal`, `writeMapProposal`.
- `readArtifactReviews`, `writeArtifactReview`,
  `verifyArtifactReviewEvidence`.
- `observeMapSources`, plus `MapWriteOptions` and `MapSourceObservation`.

**Layout** (`layout.ts`, `annotation-layout.ts`, `card-metrics.ts`)

- `routeMapEdges` — computes connector polylines; `mapLabelHeight`;
  `mapDrawingGeometryProblems`; `MapRoutingNode`, `MapRoutingEdge`,
  `MapEdgeRoute`.
- `mapAnnotationLayout`, `mapNoteTextHeight`, `MapAnnotationLayout` —
  word-wrapped text-box sizing for the Inter font.
- `mapCardWidth`, `mapCardHeight`, `mapCardAnchorHeight`, `mapCardTitleLimit`,
  `mapCardSummaryLimit` — fixed card geometry constants, re-exported through
  `index.ts`. `mapCardRowGap` and `mapCardEstimate(card)` (estimated card height
  after text flow; conservative so it is never smaller than the rendered card)
  are exported from `card-metrics.ts` but not re-exported by `index.ts`.

**Render** (`render.ts`)

- `renderMapMarkdown`, `renderMapMermaid`, `buildMapDrawingPlan` — a
  human-readable document, a Mermaid flowchart, and a fully geometry-resolved
  drawing plan.

**Lifecycle** (`proposal.ts`, `review.ts`, `context.ts`)

- `createMapProposal`, `validateMapProposal`, `acceptMapProposal`.
- `createArtifactReview`, `validateArtifactReview`, `findArtifactReview`,
  `ArtifactReviewInput`.
- `buildMapContext`, `MapContextOptions` — assembles a size-bounded context
  with a readiness assessment.

## Invariants

- **The persisted schema is strict and versioned.** `schemaVersion` is the
  literal `1`, and `validateMapContract` rejects any unknown field against an
  allowlist. Adding a field is therefore a breaking change for existing readers.
- **Collections are canonicalised.** All five collections (`sources`, `nodes`,
  `edges`, `requirements`, `findings`) are sorted ascending by id with no
  duplicates after parsing; reference lists are deduplicated and sorted too.
  This is what makes `hashMapContract` stable across writers.
- **Ids and paths are constrained.** Every id matches
  `/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/`. Every file path must be relative,
  never absolute, and contain no `..` segment.
- **References must resolve.** Edges must name existing nodes; requirement ids
  on nodes and edges must exist in `requirements`; source ids on nodes and
  requirements must exist in `sources`. A node or requirement with `observed` origin needs at
  least one source id — an observation without a source is not an observation.
  Edges carry no source ids, so this applies to nodes and requirements only.
- **A proposal is bound to the contract it was made against.**
  `createMapProposal` requires the same id and kind and a changed hash;
  `acceptMapProposal` rejects a proposal whose `baseHash` no longer matches the
  live contract. Accepting returns a clone and deliberately carries no owner
  review forward: the new hash needs a new review.
- **A review is bound to a hash.** Review and proposal hashes are observation
  digests of the rest of the record, so mutating any field invalidates the
  stored hash. `writeArtifactReview` verifies the SHA-256 of every referenced
  evidence file on disk before appending. The same id with the same hash is
  accepted idempotently; the same id with a different hash is an error.
- **A resolved finding must say how.** `status: "resolved"` requires a
  non-empty `resolution`.
- **Detail links are pinned to one file.** A detail-link node carries exactly
  one source of kind `"contract"` with `path`, `fileId`, `pageId` and `frameId`
  populated and non-empty `requirementIds`. When a map has any detail link, all of
  its sources together may name at most one distinct `fileId`. A contract may hold
  at most 64 detail links.
- **Layout is deterministic.** `routeMapEdges` sorts edges (aligned direct
  connections first, then by id) before routing, so identical input node
  positions and edge lists yield identical geometry.
- **Write ordering is lock-scoped.** `writeMapContract` with `expectedHash`
  re-reads the current file inside the exclusive lock before writing, and
  `writeArtifactReview` always re-reads the review log inside the lock before
  appending. Content read outside a lock cycle must not be assumed stable.

## Side Effects

- **Filesystem reads**: contracts, proposals, review logs and observed sources,
  all at caller-supplied relative paths beneath a root, bounded to 16 MiB per
  file and 64 MiB for evidence files. Path traversal is blocked by `mapPath`.
- **Filesystem writes**: contracts, proposals and the review log, through
  `atomicWriteFile` behind an exclusive `.lock` file created `wx` at mode
  `0o600` and removed in a `finally` block. The review log is always replaced;
  contracts refuse to replace unless the caller opts in. `writeArtifactReview`
  throws once the log holds 10,000 records, and `writeMapProposal` accepts
  `allowIdentical`, which tolerates an existing file only when its bytes are
  identical to the new proposal.
- **Non-determinism**: `createArtifactReview` draws a `randomUUID()` for the
  review id and a wall-clock `recordedAt`. Every hash computation is
  deterministic.
- **No network or MCP calls**, and no mutation of caller-supplied objects —
  `acceptMapProposal` returns a `structuredClone`.
- **No stdout contract.** This is a library: it returns values and throws.

## Verification

- Run: `pnpm test` from `packages/core`.
