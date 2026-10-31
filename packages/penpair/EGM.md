# penpair Blueprint

## System Overview

`penpair` is the short, unscoped name on npm — the package behind
`npx penpair setup`. It is a thin wrapper for `@penpair/web` and nothing else:
no source, no build step, no `dist`. Its only content is a three-line `bin`
script that imports `@penpair/web/cli`, which is exactly why this package is a
bin entry and no more.

It sits at the outside edge of a deliberate layering. `@penpair/core` holds the
library and engine and has no command; `@penpair/web` and `@penpair/docker` are
the two command packages; this package renames one of them. A user installs
exactly one command package, so `penpair` and `@penpair/docker` both declaring
the bin name `penpair` is intentional rather than a conflict.

Release note worth knowing before reading the version files: a release may
legitimately omit this wrapper from npm under the owner-approved exception
`PENPAIR_RELEASE_EXCLUDE_PENPAIR=true`, while **all six repository versions still
move together** and the omission must be reported.

There is no direct source at this level. `README.md` here is the published,
human-maintained npm readme and is not part of this contract.

## Subdirectories & System Boundaries

- `bin`: [./bin/EGM.md](./bin/EGM.md) — `penpair.js`, the executable shim.
  `#!/usr/bin/env node` plus `import "@penpair/web/cli";`. Shipped verbatim; no
  logic, no exports, nothing compiled.

## Global Invariants

- **A wrapper, permanently.** No source directory, no build, no behaviour. If
  `penpair` ever did something `@penpair/web` does not, users of the short name
  would be running a different product under the same documentation.
- **One dependency: `@penpair/web` at `workspace:*`.** No `@penpair/core`, no
  `@penpair/docker`. The dependency direction never reverses — nothing in the
  repository depends on `penpair`.
- **The forward target is the `./cli` subpath export of `@penpair/web`.** That
  subpath exists for this purpose; importing the package barrel instead would
  load the library without running the command.
- **One bin, named `penpair`**, pointing at `bin/penpair.js` — not a `dist`
  path, because there is no build.
- **All packages release together at one version.** Whatever version this
  package carries must equal every other package's and the literal in
  `packages/core/src/version.ts`. The number is not restated here; the manifests
  own it. Never bump by hand; `scripts/check-versions.mjs` fails `pnpm check` on
  drift, and releases go through Changesets and `pnpm version-packages`.
- **This package cannot be published on its own** — `prepublishOnly` runs
  `scripts/guard-publish.mjs`, and `prepublishOnly` is its only script.
  `pnpm release` is the only way to publish, and never edit a guard to get a
  release through.
- **It is the only package the publishing exception may omit.** Under
  `PENPAIR_RELEASE_EXCLUDE_PENPAIR=true` five packages publish and this one does
  not; every other package stays required, versions still move in lockstep, and
  the omission is reported. Asserted by
  `packages/core/test/release-exclusions.test.ts`.
- **Published surface is `bin`, `README.md`, `LICENSE`.** `README.md` goes to
  npm and must not be modified by tooling.
- **ESM, Node >= 22.** `"type": "module"` is what makes the plain `.js` shim an
  ES module; it declares no `main`, `types` or `exports` and is not importable
  as a library.

## Global Side Effects

- Running `penpair` executes the entire `@penpair/web` command, and therefore
  `runCli` in `@penpair/core`: project filesystem writes, Penpot MCP traffic,
  console output, and whatever exit code the core sets. None of these originate
  in this package.
- Installing it pulls in `@penpair/web` and transitively `@penpair/core`.
- No Docker, no containers, no build output.

## System Verification

- `pnpm test` is **not** defined for this package: `penpair` has no tests of its
  own and no `test` script, so there is no package-level test command. Do not
  invent one.
- The real check that the forward resolves and runs is `pnpm smoke:package` from
  the repository root, which packs all six packages, installs them in an empty
  project and runs the commands.
- `test/boundary.test.ts` in `packages/core` covers only `web` and `docker`; it
  does not assert this wrapper's bin name or its `@penpair/web` dependency. The
  release exception and the wrapper's place in release order are asserted by
  `pnpm test` in `packages/core` (`test/release-exclusions.test.ts`,
  `test/release-guard.test.ts`, `test/changesets.test.ts`); the installed
  `penpair` bin is exercised by `pnpm smoke:package`.

### A note on `pnpm check`

`pnpm check` is the repository's full gate, but it cannot run in this working
tree: its first step (`pnpm check:style` → `scripts/check-code-paths.mjs`) shells
out to `git ls-files`, so the full gate needs a git checkout or worktree. In a
source copy without `.git`, run the stages individually and report the
validation as partial.
