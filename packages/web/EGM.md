# @penpair/web Blueprint

## System Overview

`@penpair/web` is the default command package: the `penpair` command for Penpot
on the web, whether `design.penpot.app` or a team's own instance. It is one of
two command packages in this repository (with `@penpair/docker`) and carries everything in
`@penpair/core` — guided setup, the safe write protocol, and the skills for AI
agents — without adding features of its own.

The architecture is deliberate. `@penpair/core` holds the library and engine and
has **no command**, so the two command packages (`@penpair/web` and
`@penpair/docker`) never contend for the bin name `penpair`; a user installs
exactly one. This package's entire contribution is a bin entry that calls the
core's `runCli` plug-in point and a barrel that re-exports the core. The
dependency goes one way: this package depends on the core, the core depends on
nothing here.

There is no direct source at this level. The implementation is two files in
`src/`; `dist/` is build output and `node_modules/` is installed state, and
neither is documented.

## Subdirectories & System Boundaries

- `src`: [./src/EGM.md](./src/EGM.md) — the whole implementation.
  `cli.ts` is the `penpair` bin (`runCli(process.argv.slice(2))` →
  `process.exitCode`); `index.ts` is `export * from "@penpair/core"`. No local
  feature code, by rule.

## Global Invariants

- **One way only.** `@penpair/core` must never import `@penpair/web`. This
  package's sole dependency is `@penpair/core` at `workspace:*`, reached through
  its public entry — never a deep `dist/` path;
  `packages/core/test/boundary.test.ts` asserts the dependency and the
  public-entry import. That test's core-side check (no core file or manifest
  mention) is written only for `@penpair/docker`, so "core never imports
  `@penpair/web`" is not asserted by a test.
- **No features live here.** Anything a user can do belongs in the core, so that
  `@penpair/web` and `@penpair/docker` cannot drift into two different commands.
- **Exactly one bin, named `penpair`**, pointing at `dist/cli.js`. The sibling
  command packages declare the same name and are alternatives, never
  co-installed.
- **All packages release together at one version.** Whatever version this
  package carries must equal that of `@penpair/core`, `@penpair/docker`,
  `penpair` and the adapters, and the literal in `packages/core/src/version.ts`.
  The number is not restated here; the manifests own it. Never bump by hand:
  `scripts/check-versions.mjs` fails `pnpm check` on any drift, releases go
  through Changesets and `pnpm version-packages`.
- **This package cannot be published on its own.** `prepublishOnly` runs
  `scripts/guard-publish.mjs`; `pnpm release` is the only path, and never edit a
  guard to get a release through.
- **The published surface is fixed by `files`**: `dist`, `docs`, `examples`,
  `LICENSE`, `README.md`. `prepack` builds and then runs
  `scripts/copy-package-docs.mjs web` to assemble the docs. `docs` and
  `examples` are regenerated at pack time; `README.md` is copied from the
  repository root only when the package has none yet, so an existing
  git-ignored `packages/web/README.md` is not refreshed by a later prepack.
- **ESM, Node >= 22.** `"type": "module"`, exports map with `.`, `./cli` and
  `./package.json`. The `./cli` subpath is load-bearing: the `penpair` wrapper
  package imports it.
- **No secrets in the repository, in output or in logs.** The MCP URL carries a
  personal key.

## Global Side Effects

- Running the command executes `runCli` from `@penpair/core`: project
  filesystem writes, Penpot MCP traffic, console output. None of it originates
  in this package.
- `tsc -p tsconfig.json` writes `dist/` from `src/` (`rootDir: src`,
  `outDir: dist`).
- `prepack` additionally writes copied documentation into the package before
  packing.
- No Docker, no local containers: that is `@penpair/docker`'s boundary.

## System Verification

- `pnpm test` is **not** defined for this package: `@penpair/web` has no `test`
  script and no `test/` directory. Running it here fails rather than passing
  vacuously.
- Build and types: `pnpm build` and `pnpm typecheck` in
  `packages/web`.
- The invariants above are tested from the core: `pnpm test` in
  `packages/core`
  (`test/boundary.test.ts` for the dependency on the core, the public-entry
  import and the bin names; `test/release-guard.test.ts` and
  `test/release-exclusions.test.ts` for the publish guards; the version check
  for the single-version rule).
- End to end, from the repository root: `pnpm smoke:package`, which packs all
  six packages, installs them in an empty project and runs them.
