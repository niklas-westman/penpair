# Projected theme preview example

## Overview

Four Penpot plugin-sandbox bodies that project one resolved theme color onto an
owned scratch root and record its provenance. The example exists to make an
honest limitation legible: it sets a literal opaque fill **directly**, which
removes any fill token binding, and it must never be reported as native per-frame
theme binding. Bindings outside `fill` stay untouched and independently inspected.

These files are **not Node modules.** Each is a function body evaluated inside the
Penpot plugin sandbox with `penpot` and `CFG` in scope and a top-level `return`.
`biome.json` excludes `examples/theme-preview/**` from formatting for that reason.
See [plugin code conventions](../../docs/conventions/plugin-code.md). Human-maintained
usage instructions live in [`README.md`](./README.md) — do not fold them into here.

## Interface

Each file's first line is a load-bearing pragma (`// penpair: read`,
`// penpair: write`, `// penpair: idempotent`) declaring its protocol role.

| File | Role | Contract |
| --- | --- | --- |
| `helpers.js` | `// penpair: read` | `previewInput()` — validates the projection artifact and the target root. Returns `{ root, value, provenance, preserved }`. |
| `inspect.js` | `// penpair: read` | Pre-write inspection. Returns `{ ok, rootId, desiredColor, provenance, preserved }`. |
| `apply.js` | `// penpair: write`, `// penpair: idempotent` | The single write. Returns `{ ok: true, rootId }`. |
| `readback.js` | `// penpair: read` | Independent verification of color, opacity, fill binding and provenance. |

Required `CFG` parameters: `preview` (the projection artifact as literal JSON),
`color` (token name), `rootId`, `marker`, plus `CFG.inspection` for `apply.js`.

## Invariants

- **Only a complete, explicit projection is accepted.** `previewInput()` throws
  unless the artifact has `schemaVersion === 1`, `kind === "projected-theme-preview"`,
  `nativeBindings === false`, a 64-hex `sourceHash`, `complete` true, and an **empty**
  `unknowns` array. A partial projection is refused, never guessed through.
- **One literal opaque hex color.** Exactly one resolved token must match
  `CFG.color` with `type: "color"` and a `#rrggbb` value. Gradients, opacity and
  token semantics are never inferred.
- **The target must be an owned scratch root.** The shape must resolve by
  `CFG.rootId` and carry `getSharedPluginData("penpair", "owner") === CFG.marker`.
  An existing design root is never adopted implicitly.
- **The pinned snapshot is checked before the write.** `apply.js` throws unless
  `CFG.inspection` still matches the current `rootId`, `provenance` **and**
  `preserved` bindings. A changed projection input or a changed non-fill binding
  refuses the write.
- **Idempotent by comparison, not by force.** `apply.js` assigns `fills` and the
  provenance key only when they already differ, so repeating preserves IDs,
  bindings outside `fill`, and the same provenance string.
- **Provenance is recorded under a separate key.** `penpair`/`projection` holds
  `kind`, `sourceHash`, `theme`, `sets`, `projectedProperties`, `preservedBindings`
  and `nativeBindings: false` — a permanent record that this was a projection.
- **The honest limitation.** Setting the fill directly **removes any fill binding.**
  Typography, spacing and radius bindings remain real bindings. Do not describe the
  result as native theme binding.
- Readback is independent: it re-reads `fills`, `tokens.fill` and the provenance key
  from the file rather than trusting the write's return value.
- Live acceptance of this example is still pending; coverage is sandbox-body tests only.

## Side Effects

- **Mutates a Penpot design file** when `apply.js` runs: replaces `root.fills` with
  one opaque fill and writes shared plugin data `penpair`/`projection`.
- **Destroys the fill token binding** on the target root. This is the example's
  documented cost, not a bug.
- `helpers.js`, `inspect.js` and `readback.js` are read-only.
- No disk, network or process access: these are sandbox bodies, not Node programs.
- The upstream `penpair marwes tokens preview` step that produces the artifact
  resolves the theme offline and changes no active flags.

## Verification

- Sandbox-body coverage: `pnpm --filter @penpair/core test`, which includes
  `packages/core/test/theme-preview-example.test.ts` (it loads this directory at
  line 15). `pnpm test` from the repository root runs it too.
- Live verification is the protocol: inspect, apply once, read back, then compare
  catalog definitions, theme/set selections and unrelated objects against the pinned
  pre-write inspection and look at two stable exports.
- Do not execute these files with `node`.
