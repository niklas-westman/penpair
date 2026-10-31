# snippets

## Overview

Snippet factories for the two general-purpose housekeeping operations (moving
stray boards into an archive board, and removing ghost shapes left behind by an
interrupted build) plus a third group of read-only inspectors in `read.ts`
(`pages`, `switchPage`, `frames`, `tree`, `audit`, `tokensDump`).

Every function here is pure. It returns a `Snippet` object — `{ name, code,
effect }` — holding JavaScript destined for the Penpot plugin sandbox, and
executes nothing. Transport and execution live in `../client.ts`. Each housekeeping operation
comes as a triple that mirrors the repository's write protocol: an `inspect`
read, an idempotent `apply`, and an independent `readback`.

`src/index.ts` re-exports `archive.ts` and `read.ts` directly; there is no
`index.ts` in this directory.

## Interface

**`archive.ts`** — re-exported from the package root.

- `ArchiveParams` — the parameter shape shared by all three functions.
- `archiveInspect(params)` — read-only: which boards would move, and whether an
  archive board already exists.
- `archiveApply(params)` — write: nests candidate boards into the archive board
  and moves it to `x = params.x, y = 0`. Safe to re-run; boards already inside
  are left alone.
- `archiveReadback(params)` — independent read after the write: what is inside
  the archive and what remains loose.

**`read.ts`** — re-exported from the package root.

| Symbol | Role |
| --- | --- |
| `pages()` | Lists all pages with child counts. |
| `switchPage(name)` | Asks the editor to open a named page; takes effect for the *next* snippet. |
| `frames(params)`, `FramesParams` | Lists boards, with an optional bounded recursive walk (budget 10,000 nodes); an explicit `frameIds` selection must be 1–1000 distinct (case-insensitive), non-blank ids of at most 64 characters, else it throws. |
| `tree(params)`, `TreeParams` | One line per shape, indented, with layout metadata; depth 0–100, limit 1–1000. |
| `audit(params)`, `AuditParams` | Scans for blank text, unbound fills and strokes, bad spacing and overflow. |
| `tokensDump()` | Returns token sets and themes. |

**`repair.ts`** — **not** re-exported from `src/index.ts`; callers import the
file directly.

- `RepairParams`, `repairInspect(params)` — read-only: counts and describes
  ghost shapes, up to 50 shown.
- `repairApply(params)` — write: removes each ghost, guarded by
  `expectedCount`.
- `repairReadback(params)` — independent check of remaining ghosts.

## Invariants

- **The 90 KB ceiling always applies, and is checked at construction.** Every
  function delegates to `snippet()` in `../snippet.ts`, which throws
  `PenpairError("snippet-too-large")` when the assembled code exceeds
  `maxSnippetBytes` (`90 * 1024`, declared in `../client.ts` with the note that
  Penpot's proxy refuses bodies of about 110 KB). A new factory that assembles
  code by any other route loses this guarantee.
- **Exactly zero or one archive board.** Two or more boards matching the archive
  name returns `{ ok: false, message: "archive name is ambiguous" }`. The archive
  board always sits at `y = 0`.
- **The archive is append-only.** `archiveApply` only moves boards *in*; it
  never removes any. It aborts if `expectedPlan` (compared as serialised JSON) or
  `expectedArchiveId` changed since the inspect.
- **Every page-scoped snippet guards its page.** The embedded `requirePage`
  returns `{ ok: false, wrongPage: true }` if the editor is on another page, and
  `{ ok: false }` if the page name is ambiguous. This is why `switchPage` only
  takes effect for the next snippet rather than the current one.
- **A ghost has a precise definition**: a direct page-root child whose `.id` is
  not a non-empty string. `repairApply` refuses to run if `expectedCount` does
  not match the live ghost count, so a repair can never remove more than was
  observed.
- **Parameters are validated before a snippet exists.** `tree()` throws eagerly
  in TypeScript if `limit` falls outside 1–1000 or `depth` outside 0–100.
- **Scan budgets are bounded, so a result may be partial.** `audit` stops at 20
  frames, 20,000 nodes or 5 seconds, and caps examples at 8 per category and
  65,536 bytes overall; `tokensDump` caps at 5,000 records and 262,144 bytes.
  Treat a result as a sample, not a proof of absence.

## Side Effects

- **None on the host.** No filesystem I/O, no network calls, no MCP calls, no
  clock or random-id use. The `audit` body calls `Date.now()`, but only inside
  the Penpot plugin sandbox.
- **One synchronous throw at construction time**, before any Penpot connection
  is touched: `PenpairError("snippet-too-large")` above 90 KB. That is the only
  check `snippet()` performs — it does **not** parse the body. Syntax validation
  is the separate exported `compiles(code)`, called by `kit.ts`, `run-file.ts` and
  `registry.ts` but never by `snippet()`, so a syntactically invalid body is constructed
  silently here and fails only once the editor executes it.
- **No stdout.** Errors propagate as thrown exceptions.

## Verification

- Run: `pnpm test` from `packages/core`.
