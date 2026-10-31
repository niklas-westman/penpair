# @penpair/web Source

## Overview

Two files, and deliberately nothing more. This directory is the whole
implementation of `@penpair/web`: a `bin` entry point that hands `process.argv`
to the core's `runCli`, and a barrel that re-exports the core so an adopting
project imports from one place. All behaviour — setup, the skills, the write
protocol — lives in `@penpair/core`. The thinness is the design: the core owns
no command, and this package is the command for Penpot on the web.

## Interface

- `cli.ts` — executable module (`#!/usr/bin/env node`), no exports. Built to
  `dist/cli.js` and published as the `penpair` bin. Awaits
  `runCli(process.argv.slice(2))` from `@penpair/core` at module top level and
  assigns the result to `process.exitCode`.
- `index.ts` — `export * from "@penpair/core"`. The package's `main`/`types`
  entry (`dist/index.js`, `dist/index.d.ts`); it adds no symbols of its own.
- No subdirectories.

## Invariants

- **No local feature code.** Any command, option or behaviour belongs in
  `@penpair/core`. Adding implementation here splits the command surface between
  two packages and diverges `@penpair/web` from `@penpair/docker`.
- **`runCli` is reached only through the core's public entry.** Importing a deep
  path such as `@penpair/core/dist/...` is forbidden and asserted by
  `packages/core/test/boundary.test.ts` ("depends on the core as a dependency and
  reaches it only through its public entry").
- **The dependency goes one way.** The core must never import this package (not
  asserted by a test; the boundary test's core-side check is written only for
  `@penpair/docker`); this package's only dependency is `@penpair/core` at
  `workspace:*`.
- **The exit code is the contract.** `cli.ts` sets `process.exitCode` and never
  calls `process.exit()`, so pending stdout/stderr flushes complete. Preserve
  that: an early `process.exit` can truncate output.
- **`index.ts` stays a pure re-export.** No renaming, no filtering, no added
  symbols — downstream code treats `@penpair/web` and `@penpair/core` as the same
  surface.
- **Top-level `await` is intentional.** The package is ESM (`"type": "module"`,
  Node >= 22); do not convert `cli.ts` to CommonJS or wrap it in an async main
  that swallows rejections.

## Side Effects

- `cli.ts` mutates `process.exitCode` on the global process object.
- Every other effect — filesystem writes, the Penpot MCP connection, network
  calls, logging — happens inside `runCli` in `@penpair/core`, not here.
- `index.ts` has no runtime effect beyond loading the core module graph.
- The MCP URL handled downstream carries a personal key: it must never be
  printed or logged, so do not add argv or environment echoing to `cli.ts`.

## Verification

- `pnpm test` is **not** defined for `@penpair/web`: the package has no `test`
  script and no `test/` directory. Running it in this directory fails rather
  than passing vacuously.
- Type and build check: `pnpm typecheck` (or `pnpm build`) in
  `packages/web`.
- Part of the invariants above are asserted from the core: `pnpm test` in
  `packages/core`, which runs `test/boundary.test.ts` (command-package
  dependency on the core, public-entry import, the `penpair` bin of each
  command package) and the version check. The core-never-imports-web direction
  is not covered.
