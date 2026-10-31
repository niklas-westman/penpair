# Convention templates

## Overview

Three minimal patterns, each answering a row of the table in
[`../README.md`](../README.md): how to write a helper and its test, how to add an
adapter command, and how to generate code for the Penpot sandbox.

**All three are executed, which is what makes them contracts rather than
illustrations.** `conventions.test.ts` imports and runs each one, so a breaking
change in `packages/core` fails here first. For `adapter-command.ts` that means
both exit codes, the thrown usage error, the `context.output?.result` and
`context.log` reporting, and the metadata `penpair --help` reads.

Production code **never imports these templates.** They are copied, then renamed to
the nearest production module's domain vocabulary.

## Interface

| File | Exports |
| --- | --- |
| `frame-label.ts` | `FrameLabel` (`interface`: `pageName`, `frameName`); `formatFrameLabel(label): string` → `"Page / Frame"` |
| `frame-inspection.ts` | `createFrameInspection(frameName): Snippet` — a `"read"`-mode sandbox snippet that resolves exactly one uniquely named board |
| `adapter-command.ts` | `exampleStatusCommand: AdapterCommand` (`name: "example-status"`) — registered via `defineAdapter({ commands: [...] })` when adopting the pattern; its module-private `runExampleStatus` is the `run` handler |

`conventions.test.ts` is the executing test and is not part of this interface.
It imports `compiles` from `packages/core/src/snippet.js`, `formatFrameLabel`,
`createFrameInspection`, and — crossing directories —
`findInvalidCodeDirectories` from [`scripts/check-code-paths.mjs`](../../../scripts/EGM.md).

Upstream dependencies, all by relative path into the workspace:
`packages/core/src/adapters.js` (`AdapterCommand`, `AdapterContext`) and
`packages/core/src/snippet.js` (`snippet`, `Snippet`, `compiles`).

## Invariants

- **These examples must compile and run.** `pnpm conventions:check` typechecks them
  under `../tsconfig.json` (`allowJs` and `checkJs` on, `noEmit`) and runs
  `templates/**/*.test.ts`. A template that only looks right is a failing template.
- **Validation comes first and throws.** `formatFrameLabel` trims, then throws on an
  empty page or frame name; `createFrameInspection` throws on a blank frame name.
  Returning a degraded value instead of throwing breaks the pattern being taught.
- **Generated sandbox bodies must be uniquely resolvable.** The snippet returns
  `{ ok: false }` unless exactly one matching board exists — the repository's
  ambiguity rule, in miniature.
- **Sandbox snippets declare their mode.** `createFrameInspection` passes `"read"`
  as the fourth `snippet()` argument. A read snippet must not mutate.
- **JavaScript inside a template string is string data to Biome.** Format the snippet
  body deliberately and test the generated output; never run blind whitespace
  rewriting over it. The test compiles the body as an async function body and
  executes it against a stub `penpot`.
- **Adapter commands return exit codes, not thrown control flow.** `runExampleStatus`
  returns `0` or `3`, reports through both `context.output?.result` and `context.log`,
  and throws only on a usage error.
- **The neutral core still applies.** These templates may name `@penpair/core` APIs;
  they must not push project or component-library knowledge back into the core.
- File and directory names stay kebab-case — enforced by Biome and by
  `check-code-paths.mjs`, whose own `docs/conventions/` rule is exercised by the test
  in this directory.
- Keep templates minimal: add one only when a real feature needs the pattern, and
  never introduce a framework or dependency just for a template.

## Side Effects

- **None at module scope.** All three exports are pure: no disk, network, process or
  global state.
- `createFrameInspection` *builds* a snippet string; it does not send it anywhere.
  Executing it against a live Penpot file is the caller's act, and the snippet is
  read-only.
- `conventions.test.ts` executes the generated body against an in-memory stub, not a
  real Penpot file, and asserts on `findInvalidCodeDirectories` with literal path
  arrays — it does not shell out to `git`.

## Verification

- Run from the repository root: `pnpm conventions:check`
  (`tsc -p docs/conventions/tsconfig.json && vitest run --config docs/conventions/vitest.config.ts`).
  This is the command that executes these templates; the root `pnpm test` is
  `pnpm -r test` over the workspace packages and does **not** reach this directory,
  because `docs/conventions` is not a workspace package.
- `pnpm check:style` covers naming and formatting.
- The repository's full gate is `pnpm check`. It needs a git checkout or worktree,
  because `scripts/check-code-paths.mjs` shells out to `git ls-files`. In a source copy
  without `.git`, run the stages individually and report the validation as partial.
