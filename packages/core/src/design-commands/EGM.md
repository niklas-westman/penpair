# design-commands

## Overview

The command layer for design work: journey maps, integration maps and design
releases. Each file turns parsed command-line arguments into calls against the
model, the store and a live Penpot connection, then reports a structured result
and an exit code.

This directory holds no design knowledge of its own. The map model lives in
[`../maps`](../maps/EGM.md), its Penpot rendering in
[`../map-penpot`](../map-penpot/EGM.md), and the release pipeline in
[`../design-releases`](../design-releases/EGM.md). What is specific to this
directory is the gating: which flags are required before a live write, what must
be re-read before a result is trusted, and what is refused outright.

## Interface

`index.ts` is the public boundary of the directory, and it exports only
`runDesignCommand` and the type `DesignCommandContext`. The three handlers below
are internal: `runMapCommand` comes from `map-command.ts`, and
`runDesignReleaseCommand` and `runDesignReleaseCopyCommand` from
`release-command.ts` (not re-exported by `index.ts`).

| Symbol | Role |
| --- | --- |
| `runDesignCommand(family, args, context)` | Single entry point; dispatches `"design-release"` to the release command and both map families to the map command. Resolves to an exit code. |
| `DesignCommandContext` | The context every command receives (defined in `context.ts`). |
| `runMapCommand(kind, args, context)` | Handles the `journey-map` and `integration-map` families. |
| `runDesignReleaseCommand(args, context)` | Handles the `design-release` family. |
| `runDesignReleaseCopyCommand(args, context)` | Handles `design-release copy`, including the native clipboard path. |

`DesignCommandContext` carries the project root on disk, a `CommandOutput` sink
for logs and structured results, a `redact(value)` credential scrubber, an
optional owner-confirmed copy target (file id, origin, loopback-alias
permission), and `withPenpot(work)` to open a strictly pinned live connection.

Actions per family:

- `journey-map` / `integration-map`: `check`, `render`, `publish`, `import`,
  `accept`, `approve`, `context`.
- `design-release`: `plan`, `adopt`, `assemble`, `verify`, `finalize`, `check`,
  `status` (`--live`, `--comparison`), `context`, and `copy` (delegated).

Internal modules not re-exported: `options.ts` (`mapActions`,
`mapBooleanOptions`, `releaseOptions`, `releaseActions`, `copyOptions`) —
the `parseArgs` option tables and per-action flag allowlists shared by the
map and release command handlers. Callers outside this directory do not
need them.

## Invariants

- **`--apply` is the only gate for a live write.** Every action that could
  mutate a remote Penpot file is preview-only by default. Adding an action that
  writes without honouring `--apply` breaks the contract the whole command
  surface rests on.
- **`--resume RUN_ID` requires `--apply`.** Enforced for map publish and for
  release assemble and finalize; resuming a journalled run is a write.
- **Redact before any filesystem write.** `writeOutput` and
  `writeReleaseOutput` pass the serialised output through `context.redact()` and
  throw — writing nothing — if the result differs from the input. A protected
  value that survives redaction is a hard failure, not a warning.
- **An output path may not overwrite a canonical input.** `outputTarget`
  verifies the destination is neither the contract file nor any of its declared
  source paths, and throws before any write.
- **Re-read the live projection before accepting a native observation.** On
  `accept`, the projection fingerprint is read again from Penpot; if the live map
  moved after the import step, the acceptance is aborted and neither the contract
  nor the baseline is touched.
- **Re-verify after the export, before saving evidence.** Once the PNG is
  exported, the live projection is read again to confirm the fingerprint is
  unchanged and the on-disk contract is re-hashed. Evidence is written only if
  both still match.
- **Approval requires fresh inputs and no open blocking finding.** The
  `approve --write` path requires `freshness === "matches-supplied-inputs"` and
  no `severity === "blocking"` finding still `"open"`; either condition throws.
- **The two approval paths use different flags; they are not symmetrical.**
  `map approve` gates on `--write`, which requires `--by` and `--note`.
  `design-release finalize` gates on `--apply`: `--write` is not in its accepted
  flag list at all and the strict flag check rejects it.
- **`accept` on a native proposal requires a saved baseline projection**, and
  throws without one. The canonical-only path does not.
- **`publish` and `import` require a complete drawing plan.** An incomplete plan
  throws, listing its reasons, before any Penpot connection is opened.
- **Ceilings.** A saved projection is rejected above 10,000 shapes. A copy takes
  1–100 frame ids with no duplicates. Release receipt arrays cap at 100 entries.
- **`check --projection` requires `--live`**, and throws immediately otherwise.
- **`context` is gated on readiness.** Map `context` throws unless the status is
  ready; `design-release context` throws unless the release is `"final"`. Both
  relax only under `--draft`.

## Side Effects

- **Filesystem**, all under the context root and all through the atomic write
  helper: the map contract (in place, checked against `expectedHash`), the
  proposal file and its sibling `.native.json` observation, the projection file,
  evidence (`projection.json.evidence.json` and a content-addressed PNG under
  `map-evidence/`), a render snapshot under `map-evidence/`, the appended reviews
  file, and the release JSON.
- **Penpot**, through `context.withPenpot`: `check --live` reads only; `publish`
  reads the live file id then writes shapes when applying; `import` and `accept`
  read the projection; `accept` also exports a PNG; `assemble`, `verify` and
  `finalize` each call their release counterpart against the live file.
- **Native clipboard**, on `copy --apply` only: connects to a browser debug port
  for the configured origin and file id, with a 30-second timeout, cancellable
  through the command signal.
- **Stdout**: a structured `result` for machine consumers plus a human-readable
  JSON `log`, with progress on stderr. Exit codes are `0` success or ready,
  `2` drift detected, `3` incomplete, unverified or not ready.
- No process spawning.

## Verification

- Run: `pnpm test` from `packages/core`.
