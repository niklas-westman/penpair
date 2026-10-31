# Hello card example

## Overview

A complete worked instance of the repository's write protocol, expressed as four
raw Penpot plugin-sandbox bodies: a read-only inspect, one idempotent write, and
an independent readback, over a shared read-only helper. It builds a single named
board carrying an ownership marker, binds its card and text to existing active
tokens, and reads the result back without reusing the write's own return value.

These files are **not Node modules.** Each is a function body evaluated inside the
Penpot plugin sandbox with `penpot`, `CFG`, `pp` and `await` already in scope and a
top-level `return`. `node` cannot run them and Biome cannot parse them as modules,
which is why `biome.json` excludes `examples/hello-card/**` from formatting. See
[plugin code conventions](../../docs/conventions/plugin-code.md). Human-maintained
usage instructions live in [`README.md`](./README.md) — do not fold them into here.

## Interface

Each file opens with load-bearing pragma comments that declare its protocol role:
`// penpair: read` or `// penpair: write` on the first line, and for a write body
`// penpair: idempotent` on the next.

| File | Role | Contract |
| --- | --- | --- |
| `helpers.js` | `// penpair: read` | `inspectHelloExample()` — the shared observation. Returns `{ expected, actual, id, satisfied, rootIds }`. Included into the other three via `--include`. |
| `inspect.js` | `// penpair: read` | Pre-write inspection. Returns `{ ok: true, ...observation }`; throws if an owned example exists but differs. |
| `build.js` | `// penpair: write`, `// penpair: idempotent` | The single write. Returns `{ ok: true, rootId, layout, phases, slowest }`, or `{ ok: true, alreadyBuilt: true, rootId }` when already satisfied. |
| `readback.js` | `// penpair: read` | Independent verification. Returns `{ ok: true, rootId, verification: { expected, actual } }`, even when the root is missing (`rootId: null`, `actual: { missing: true }`) or unsatisfied, so the caller must compare `expected` and `actual`; it still throws on invalid `CFG` or an ambiguous or unowned root. |

Required `CFG` parameters: `name`, `marker`, `typo`, `color`, `space`, `radius`
(all non-empty strings), plus `CFG.inspection` — the pinned snapshot — for `build.js`.

## Invariants

- **The pinned snapshot is checked before the write.** `build.js` throws unless
  `CFG.inspection` exists and `observation.rootIds` still matches it exactly. A page
  that changed between inspect and apply refuses the write.
- **Idempotent, never destructive.** A satisfied example returns `alreadyBuilt: true`
  and preserves IDs. An existing-but-different root throws
  (`"Existing example needs a separate reviewed edit"`) rather than deleting or
  rewriting content.
- **Ownership is unambiguous or nothing happens.** `helpers.js` throws if the name
  matches more than one root, if the `penpair`/`example` marker moved or duplicated,
  or if an existing root is not owned by this marker. The marker is bookkeeping, not
  authorization.
- **Readback is independent.** `readback.js` re-derives `actual` from the page; it
  never echoes the write's return value. Structural and token equality is
  `JSON.stringify(expected) === JSON.stringify(actual)` over a fixed field set
  including `count: 3`.
- Identity and size are bounded: the subtree walk throws past 20 nodes and on any
  missing or repeated shape ID.
- **Partial writes are rolled back.** `build.js` wraps creation in `try/finally` and
  calls `root.remove()` if `pp.flush({ root })` did not complete.
- Token names must be existing active typography/color/spacing/radius tokens; the
  example binds, it does not invent them.
- Keep these bodies under the 90 KB snippet ceiling and out of Biome's module parser.

## Side Effects

- **Mutates a Penpot design file** when `build.js` runs with `--apply`: creates one
  board, sets `name`, `fills`, size 300×180, shared plugin data
  (`penpair`/`example` = `CFG.marker`), and the `hello-card` recipe subtree.
- Writes shared plugin data under the `penpair` namespace.
- `inspect.js`, `readback.js` and `helpers.js` are read-only and mutate nothing.
- No disk, network or process access: these bodies run in the plugin sandbox, not in Node.
- Running the write against a non-scratch file changes real design content. Only an
  owner-authorized scratch file is an acceptable target.

## Verification

- Sandbox-body coverage: `pnpm --filter @penpair/core test`, which includes
  `packages/core/test/kit-integration.test.ts` (it loads this directory at line 324
  and compiles these bodies). `pnpm test` from the repository root runs it too.
- Live behaviour is verified only by the protocol itself: inspect, apply, readback,
  then look at two exports. A first export after a write can be stale — look twice.
- Do not execute these files with `node`; they are sandbox bodies, not programs.
