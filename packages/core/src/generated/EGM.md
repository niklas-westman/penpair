# generated

## Overview

Tracked build output, not hand-written source. One file lives here:
`layout-settling-source.ts`, which exports the layout-settling implementation as
a **string** for the Penpot plugin sandbox to evaluate.

It exists because the sandbox cannot import modules. The settling algorithm is
written once as real TypeScript in [`../layout-settling.ts`](../layout-settling.ts)
— typechecked, and directly unit-testable as a function — and this directory
holds the serialised copy that gets sent into the editor.

Serialisation happens at an explicit developer step rather than at runtime. An
earlier design called `settleLayout.toString()` while building the kit, which
meant the same logical source produced different bytes depending on which copy
of the module the consumer had loaded: TypeScript source, `tsc` output, and
`tsc` output re-transformed by vitest all differed. Because the kit is held to a
per-source byte ceiling, a change could pass `packages/core`'s own tests and
still fail a package that imported the built core. Generating the text once and
tracking it removes that class of failure: every consumer loads identical bytes.

## Interface

`layout-settling-source.ts`

- `layoutSettlingSource: string` — the `settleLayout` function body as
  dependency-free JavaScript, ready to be embedded in a sandbox snippet.

There is nothing else to import from here, and nothing here should be imported
except by the layout policy that assembles the snippet.

## Invariants

- **Never edit a file in this directory by hand.** The first line of the
  generated file says so. Edit [`../layout-settling.ts`](../layout-settling.ts)
  and run `pnpm sandbox:generate`.
- **The tracked artifact must match its source.** `pnpm sandbox:check` runs the
  generator with `--check`, which compares without rewriting and throws
  `"Sandbox source is missing or stale; run pnpm sandbox:generate"`. This check
  is wired into `packages/core`'s own `build` script, and the root `check` script
  runs `pnpm build` — so a stale artifact fails the gate rather than shipping.
  `test/layout-source.test.ts` guards the same property independently.
- **The generated text must be dependency-free.** The generator refuses a
  `settleLayout` that references an imported binding rather than silently
  dropping it from the sandbox, where the import would be unresolvable. It also
  requires exactly one `settleLayout` implementation in the source.
- **Generation is deterministic and path-independent.** The same input text
  always produces the same module, and the output must not embed an absolute
  path from the generating machine — asserted in `test/layout-source.test.ts`.
- **This string counts against the kit byte budget.** It is embedded into kit
  source, so growth here consumes headroom under the per-source and combined
  ceilings. The ceilings and the measurement rule have their canonical home in
  the maintained kit documentation under `docs/`; do not restate the numbers
  here. Measure the built output, and run the adapter packages' tests as well as
  the core's.
- **A single exported constant is the whole contract.** Adding a second
  generated artifact means extending the generator and this contract together.

## Side Effects

- **None at import time** beyond allocating one string constant. No filesystem
  access, no network, no MCP calls, no stdout.
- **Written by** `scripts/generate-layout-source.mjs` (via `pnpm sandbox:generate`),
  which is the only thing that may write here.
- **Read by** `../layout-policy.ts`, which embeds the string into the snippet it
  builds, and by `test/layout-source.test.ts`.

## Verification

- `pnpm sandbox:check` — the artifact matches its source.
- `pnpm build` from `packages/core` — runs the same check before compiling.
- `pnpm test` from `packages/core` — includes `layout-source.test.ts`, which also
  replays the generated JavaScript against host-policy scenarios and asserts the
  kit bytes are identical between source and built consumer imports.
