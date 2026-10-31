# Protocol trial bodies

## Overview

Penpot plugin-sandbox bodies that exercise the failure paths of the write protocol
on purpose. Unlike the other examples, these are not meant to succeed cleanly:
`hold-writer.js` opens a controlled contention window, `recovery-build.js` can be
told to fail *after* a successful owned write, and `wrong-file-read.js` is a benign
read that the same-execution file guard is expected to block. They are how the
repository proves that contention, resume-after-fault and wrong-target behave as
documented rather than as hoped.

These files are **not Node modules.** Each is a function body evaluated inside the
Penpot plugin sandbox with `penpot`, `CFG` and `await` in scope and a top-level
`return`. `biome.json` excludes `examples/trials/**` from formatting for that
reason. See [plugin code conventions](../../docs/conventions/plugin-code.md).

## Interface

Three trials, each following the inspect / write / readback shape.

| File | Role | Contract |
| --- | --- | --- |
| `hold-inspect.js` | `// penpair: read` | Confirms the authorized scratch `fileId`/`pageId`, an empty page, and that `CFG.marker` is a non-empty string (freshness is enforced in `hold-writer.js`). Returns `{ ok, fileId, pageId, children: 0 }`. |
| `hold-writer.js` | `// penpair: write`, `// penpair: idempotent` | Holds the writer lease for `CFG.holdMs`. Returns `{ ok: true, heldMilliseconds }`. |
| `hold-readback.js` | `// penpair: read` | Reads the trial record back and reports `expected` vs `actual`, including `state: "complete"`. |
| `recovery-inspect.js` | `// penpair: read` | Returns `{ ok, existingId, width, height, rootIds }` for the resume decision. |
| `recovery-build.js` | `// penpair: write`, `// penpair: idempotent` | Creates one 160×80 owned board; throws after the write when `CFG.failAfterWrite === "true"`. |
| `recovery-readback.js` | `// penpair: read` | Independent verification of name, marker and 160×80 geometry. |
| `wrong-file-read.js` | `// penpair: read` | Returns `actualFileId`/`actualPageId`. Expected to be **refused** by the file guard when aimed elsewhere. |

`CFG` parameters: `fileId`, `pageId`, `marker`, `holdMs` (hold trial); `fileId`,
`pageId`, `name`, `marker`, `failAfterWrite` (recovery trial); plus `CFG.inspection`
for both write bodies.

## Invariants

- **The scratch target is confirmed, not assumed.** Both inspect bodies throw unless
  `penpot.currentFile.id` and `penpot.currentPage.id` equal the owner-authorized
  `CFG.fileId`/`CFG.pageId`. The hold trial additionally requires a page with
  **zero** children — a dedicated empty scratch page.
- **The pinned snapshot is re-checked at write time.** `hold-writer.js` re-verifies
  file, page and the zero-children condition; `recovery-build.js` re-compares the
  sorted `rootIds` against `CFG.inspection`. Either refuses a changed source.
- `holdMs` must be an integer in 1–30000. The delay is a **deliberate contention
  window, not layout settling** — the comment in `hold-writer.js` says so because
  misreading it as settling is the known failure mode.
- **The hold body changes no design objects.** It only writes a
  `trial-hold-<marker>` record through shared plugin data; the operation runner owns
  the advisory writer lease.
- **A reused marker is refused.** `hold-writer.js` throws if a prior record exists
  under its key, directing the operator to inspect before recovery.
- **Ownership is unambiguous or nothing happens.** `recovery-inspect.js` throws on a
  duplicate name, on a `penpair`/`trial` marker that moved or duplicated, and on an
  existing frame that is not this trial's owned object.
- **Resume is explicit, and a third state is a hard error.** A pre-existing owned
  frame must match name, 160×80 and marker exactly to return `alreadyBuilt: true`;
  anything else throws `"Owned frame has an unexplained third state"` rather than
  being repaired silently.
- **The deliberate fault leaves a real write behind.** When `failAfterWrite` is
  `"true"`, the board exists but no acknowledgment is returned. That is the point:
  recovery must be driven by an independent inspection, never by the absent return
  value. Configuration of the frame is still rolled back via `try/finally` if it did
  not complete.
- **`wrong-file-read.js` passing is a failure.** The guard must block it. A successful
  return means the same-execution file guard did not hold.
- Trial records are schema-versioned (`schemaVersion: 1`) and progress
  `holding` → `complete`.

## Side Effects

- **Mutates an owner-authorized scratch Penpot file.** `hold-writer.js` writes file-level
  shared plugin data under `penpair`/`trial-hold-<marker>` (twice: `holding`, then
  `complete`). `recovery-build.js` creates one board and writes `penpair`/`trial`.
- **Deliberately holds a writer lease** for up to 30 seconds, blocking concurrent
  writers for that window.
- **Deliberately leaves inconsistent state** when `failAfterWrite` is set: an owned
  object with no acknowledgment, requiring explicit inspected resume.
- Trial markers accumulate in the scratch file's shared plugin data; each run needs a
  fresh marker.
- Read bodies mutate nothing. No disk, network or process access — these are sandbox
  bodies, not Node programs.
- Never aim these at a real design file. Every trial assumes a disposable scratch
  file and page the owner has authorized.

## Verification

- Sandbox-body coverage: `pnpm --filter @penpair/core test`, which includes
  `packages/core/test/trial-examples.test.ts` (it loads this directory at line 21).
  `pnpm test` from the repository root runs it too.
- Live trials are owner-run against an authorized scratch file; their evidence belongs
  in git-ignored `.working-docs/`, not here.
- Do not execute these files with `node`.
