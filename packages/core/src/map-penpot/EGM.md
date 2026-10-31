# map-penpot

## Overview

The Penpot rendering layer for maps: it turns a drawing plan from
[`../maps`](../maps/EGM.md) into real shapes in a live Penpot file, reads them
back as a projection, and promotes an observed projection into a proposal the
model layer can accept.

The split matters. `../maps` owns the map model and has no idea Penpot exists;
this directory imports from it (`MapDrawingPlan`, `MapContract`, `MapProposal`,
`MapIcon`, `MapSource`, plus `routeMapEdges`, `buildMapDrawingPlan`,
`hashMapContract`, `validateMapContract` and friends) and is never imported by
it. Every write obeys the fixed protocol: inspect read-only, pin what was seen,
write once, read back independently, then export and look at it.

## Interface

`index.ts` is the public boundary.

**Types** (`types.ts`): `NativeDrawingNode`, `NativeDrawingEdge`, `MapDrawing`,
`MapTarget`, `ProjectionShape`, `NativeMapProjection`, `PublishMapOptions`,
`PublishMapResult`, `NativeMapProposal`, `ProjectionReadOptions`.

| Area | Symbols |
| --- | --- |
| Projection (`projection.ts`) | `drawingFromPlan` converts a drawing plan into a `MapDrawing`; `readProjection` runs the inspect snippet and returns a typed projection. |
| Publish (`publish.ts`) | `publishMap` runs the whole write protocol against a live file and returns a `PublishMapResult`. |
| Import (`import.ts`) | `importMapProposal` reads observed shapes back into a native proposal; `nativeProposalToMapProposal` promotes it to the canonical type owned by `../maps`. |
| Content (`content.ts`, `content-validation.ts`) | `nativeMapTextEntries`, `nativeMapShapeKeys`, `NativeMapTextEntry`. |
| Snippets (`snippets.ts`) | `inspectMapSnippet` (read-only) and `publishMapSnippet` (write and verify). |
| Presentation (`presentation.ts`) | `createMapPresentationProposal`, `validateMapPresentationProposal`, `acceptMapPresentationProposal`, `preserveMapPresentation`, `validateNativeMapProjection`, `MapPresentationProposal`. |
| Details (`details.ts`) | `resolveMapDetails` reads pinned detail contracts, SHA-256-verifies them, and stamps `mapId` and `contractHash` onto node detail fields. |
| Release (`release-maps.ts`) | `assembleReleaseMaps`, `ReleaseMapPublication` — topologically ordered batch publish of up to 100 contracts. |
| Errors and assets | `MapExportEvidenceError` (`evidence-error.ts`); `nativeMapIcons`, `defaultMapIcon` (`icons.ts`). |

Internal helpers not re-exported: `import-content.ts`, `path-geometry.ts`,
`status-labels.ts`, `spots.ts` (`mapSpotSize`, `mapSpotImages` — loads
bundled lossless WebP illustrations from `assets/map-spots/` at module
evaluation time; only the icons actually used in a drawing travel inside
the publish snippet).

## Invariants

- **The write protocol is enforced inside `publishMap`,** in this order:
  validate content and geometry before any network call; `readProjection`
  read-only; when applying to an existing board, require the caller's
  `expected.fingerprint` to match what is live (unless resuming a journalled
  run); build and size-check the publish snippet even in preview; run
  inspect → apply → readback through `runOperation`; then cross-check the
  readback against the intended drawing with `verificationProblems`.
- **The write carries its own staleness guard.** The publish snippet embeds a
  64-bit digest of the serialised pre-write projection as `CFG.expectedDigest`
  and throws if the live digest differs at write time. The source says plainly
  that this is a staleness guard, not a security boundary — treat it as such.
- **The snippet is built before anything is committed.** `publishMapSnippet` is
  constructed inside `publishMap` before any journal write or remote mutation,
  so a snippet over the ~90 KB ceiling (the proxy refuses around 110 KB) fails
  early rather than halfway through.
- **Graph limits** (`validateDrawing`): at most 1,000 nodes and 2,000 edges;
  node labels ≤ 4,000 characters, summaries ≤ 240, descriptions ≤ 4,000; nodes
  at least 64 × 32; edge `points` between 2 and 32; map title ≤ 1,000
  characters; edge path content ≤ 65,536 characters (a `content.length` check, not bytes).
- **Text budgets** (`content-validation.ts`): map goal and description ≤ 8,000
  characters with summary ≤ 240; annotation title ≤ 4,000, node-scoped
  annotation description ≤ 4,000 and map-scoped ≤ 8,000; at most 1,001
  annotations; annotation boxes at least 64 wide and more than 0 high.
- **Protected values never reach Penpot.** `publishMap` applies the configured
  redact function to the drawing before and after edge routing, to the inspected
  projection and to the projected drawing, and refuses to publish if any
  protected string survives.
- **Detail maps are pinned and verified.** `resolveMapDetails` reads each
  pinned contract from disk, verifies its SHA-256, caps the aggregate at 128 MiB
  across at most 64 direct references, and validates each with
  `validateMapDetail`. A journal root is required whenever any node carries a
  detail, and the publish snippet enforces at runtime that detail targets live
  in the same Penpot file.
- **Incomplete evidence is an error, not a warning.**
  `MapExportEvidenceError` (code `"incomplete-output"`) is raised when the write
  verified but the PNG export failed. It carries the run id and directs the
  caller to `--apply --resume <runId>`. The write is **not** rolled back; the
  evidence is simply incomplete until retried.
- **A presentation proposal may only move things.** It is rejected unless the
  projection has no conflicts, no semantic change was detected, the shape count
  and set are identical, and every shape's role, logical id and appearance hash
  are unchanged. Only `x`, `y`, `width` and `height` may differ.
- **Geometry is checked, not assumed.** Text shapes taller than their reserved
  height are flagged; node labels must fit inside their card bounds; edges must
  terminate within 0.01 px of the horizontal midpoint of an endpoint node's left
  or right edge, with a self-loop exception at the top centre.

## Side Effects

- **Penpot writes**: `publishMap` executes the publish snippet as a write
  operation against the live file, creating, repositioning and removing shapes
  and writing `sharedPluginData`. `assembleReleaseMaps` issues one such write
  per contract, in topological order.
- **Penpot reads**: `readProjection` and the inspect phase both run
  `inspectMapSnippet`, traversing up to 20,000 shapes.
- **PNG export**: after a verified write, `publishMap` calls `exportShapePng`
  when applying and export is not disabled, attaching the result.
- **Filesystem reads**: `resolveMapDetails` reads contract JSON through the
  bounded reader at paths under the journal root. There are **no** filesystem
  writes in this directory.
- **Operation journal**: `runOperation` persists a pre-write snapshot; applying
  without a journal is rejected at runtime. The journal itself lives outside
  this directory.
- **No stdout contract.** Failures surface as thrown errors.

## Verification

- Run: `pnpm test` from `packages/core`.
