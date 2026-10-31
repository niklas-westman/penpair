# penpair Bin

## Overview

One file, three lines, and that is the entire `penpair` package. `penpair.js` is
the short-name shim: it imports `@penpair/web/cli`, which runs the core's CLI as
a side effect of being loaded. The package exists so `npx penpair setup` works
without a scope, which is why it is a `bin` entry and nothing more.

## Interface

- `penpair.js` — executable module (`#!/usr/bin/env node`), no exports.
  Registered as the package's only bin: `"penpair": "bin/penpair.js"`. Body is
  `import "@penpair/web/cli";` — a bare side-effect import.
- No subdirectories.

## Invariants

- **No logic here, ever.** The file forwards and does nothing else: no argument
  parsing, no version printing, no environment setup. Behaviour divergence
  between `penpair` and `@penpair/web` would be invisible to users who think they
  installed the same thing.
- **The import target must stay the `./cli` subpath export** declared in
  `@penpair/web`'s `exports` map. Importing `@penpair/web` (the barrel) instead
  would load the library without running the command.
- **Side-effect import, not a call.** `@penpair/web/cli` executes on load and
  sets `process.exitCode` itself; adding `await` on a non-existent export or
  re-invoking `runCli` here would run the CLI twice.
- **This package depends on `@penpair/web` and on nothing else.** No direct
  `@penpair/core` dependency, no `@penpair/docker`.
- **A user installs exactly one command package.** `penpair` and
  `@penpair/docker` both expose the bin name `penpair`; they are alternatives,
  never co-installed.
- **ESM only** (`"type": "module"`, Node >= 22). Plain `.js` here is ESM because
  of that field — do not add `require`.
- **Published, so it must stay publishable.** `files` is `["bin", "README.md",
  "LICENSE"]`; `bin/penpair.js` is shipped verbatim and is not built from
  TypeScript. There is no `dist`.

## Side Effects

- Executes the full `@penpair/web` CLI on load, inheriting every effect of
  `runCli` in `@penpair/core` (filesystem writes, Penpot MCP traffic, console
  output). None of them originate in this file.
- `process.exitCode` is set by the imported module, not here.

## Verification

- `pnpm test` is **not** defined for `penpair`: the package has no tests of its
  own and no `test` script, so there is no package-level test command to run.
  Its only script is `prepublishOnly`.
- Smoke check that the forward actually resolves and runs:
  `pnpm smoke:package` from the repository root, which packs all six packages,
  installs them in an empty project and runs the commands.
- Nothing in the core's tests asserts the single bin `bin/penpair.js`, the sole
  `@penpair/web` dependency or the `@penpair/web/cli` import:
  `test/boundary.test.ts` covers only `web` and `docker`. The release tests in
  `packages/core` (`test/release-exclusions.test.ts`,
  `test/release-guard.test.ts`) cover the wrapper's release handling, and
  `pnpm smoke:package` runs the installed `penpair` bin.
