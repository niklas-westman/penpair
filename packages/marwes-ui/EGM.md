# @penpair/marwes-ui Blueprint

## System Overview

`@penpair/marwes-ui` is a penpair **adapter**: an optional package an adopting
project installs alongside one command package and registers in the `adapters`
list of `penpair.config.json`. It carries a component library's knowledge —
Marwes design tokens, component instances, icon sizing, instance swapping and
native-component gating — so that the neutral core never has to.

The subsystem has one direction of truth. The Marwes version installed in the
project, plus the project's own theme module layered on top, is the expectation.
That expectation is hashed into a committed snapshot file, the live Penpot file is
compared against it, and a push makes Penpot match. Anything that stops matching
is surfaced rather than silently reconciled, and a three-way ancestor ledger lets
the adapter tell an upstream change apart from a designer's edit and refuse to
overwrite the latter.

It depends on `@penpair/core` and plugs in through `defineAdapter`. The core loads
it by specifier and names it nowhere; the dependency runs one way only. It needs
the `penpair` command from `@penpair/web` or `@penpair/docker`, and Marwes
installed in the project.

See [`README.md`](./README.md) for the user-facing guide and
[`CHANGELOG.md`](./CHANGELOG.md) for release history.

## Interface

The package publishes a single entry point, `./dist/index.js` with
`./dist/index.d.ts` types, built from `src/index.ts`:

- `default` — the `defineAdapter` result. It contributes **one** command
  (`marwes`), **one** build kit (`marwesKit`, included as `@marwes-kit`), and a
  `status()` line reporting a `library-tokens` check as `ok` or `warning`.
- The token model, snapshot persistence, Penpot read/write helpers, ownership
  reconciliation, mode trials and the component pilot are all re-exported. The
  export an adopting project is most likely to call directly from its own test
  suite is `checkTokenSnapshot(root)`, which fails CI on a stale snapshot.

The CLI surface is `penpair marwes` with subcommands `theme lint`,
`components …` and `tokens schema|preview|migrate|snapshot|check|diff|push|status|verify-modes`.

Full symbol-level detail is in the source contract.

## Subdirectories & System Boundaries

- **src**: [`./src/EGM.md`](./src/EGM.md) — the entire implementation, in a flat
  directory. The adapter entry and `defineAdapter` wiring, the token model and
  hashing, snapshot persistence and migration, config and theme-module loading,
  the installed-Marwes resolver, ownership and reconciliation, the Penpot
  read/write engine, mode trials, the component pilot and the build kit.
- `test/` and `dist/` are outside this contract's scope: `test/` is test-only and
  `dist/` is build output. Neither is documented here.

## Global Invariants

- **One-way dependency.** This adapter depends on `@penpair/core`; the core never
  depends on it. `packages/core` must not name this library or other
  adopting projects; `neutrality.test.ts` enforces that with a short forbidden
  word list (it does not forbid every adapter name — the core's skills name the
  Reflection Check companion). Project knowledge belongs here, in the adopting
  project, or in the examples.
- **An adapter cannot do everything.** It may contribute CLI commands, an
  optional `status()` line and build kits. It may **not** register MCP tools or
  registry snippets, and it may not claim a reserved command name. The core's
  `reservedCommands` list includes both `tokens` and `snapshot`, which is exactly
  why this adapter's command is `marwes` with `tokens` as a subcommand.
- **Write protocol for any Penpot change**, implemented in `src/penpot.ts`,
  `src/mode-trial.ts` and `src/commands.ts` (`readPenpot` pins the file and throws
  `File changed during token inspection`) and not optional: read-only inspect, a pinned snapshot, one
  idempotent write, an independent readback, and an export that is looked at. A
  first export after a write or a page switch can be stale, so look twice — the
  code does this with settle-or-throw reads and double sampling, except that
  `applyPlan` and the mode trial skip the layout settle when called with
  `layout: false`.
- **Snippets sent to Penpot stay under 90 KB.** The ceiling is enforced in the
  core (`maxSnippetBytes`); this package keeps the margin by batching at 40
  tokens and 45 KB.
- **No secrets in the repository, in output or in logs.** The MCP URL carries a
  personal key: the adapter throws rather than writing output that redaction
  would have changed.
- **Persisted schemas stay stable.** The token snapshot (schema 2), the ancestor
  ledger (schema 1) and the component pilot snapshot (schema 1) are all committed
  or on-disk artifacts in adopting projects, and all are hash-covered. Changing a
  hashed field set invalidates every committed snapshot downstream.
- **Native component library generation is gated.** `marwes components build`
  always throws until preserved text and style instance overrides are proved
  against the pinned Penpot API in an owner-authorized scratch file. Removing the
  gate is a policy change.
- **Versions move together.** All packages in the repository release at one
  version, even one that did not change. Never bump a version by hand; normal
  releases go through Changesets and `pnpm version-packages`, `pnpm check` fails
  on drift, and `prepublishOnly` refuses a standalone publish. Publishing is the
  owner's act.
- Pin the Penpot version; run the smoke test before bumping it.

## Global Side Effects

- **Penpot**, reached only through the core's `PenpotToolClient` over the MCP
  proxy. A `push --apply` mutates a real design file: it creates and updates
  token sets, tokens and themes, and activates a theme. Destructive actions are
  guarded twice: `applyPlan` refuses, on the client before any write snippet runs, a
  prune of any name absent from the verified ancestor, and the snippet itself
  re-runs `assertSafeDestruction` (binding counts and token references) inside
  Penpot.
- **The adopting project's working tree**: the committed token snapshot
  (default `design/marwes-tokens.snapshot.json`), adopt proposals, preview and
  migrate output, the component pilot snapshot, and the mode-trial output tree of
  PNG exports plus manifests.
- **A private, git-ignored ledger** at `.penpair/token-sync/`, written under an
  exclusive lock at mode `0o600`, with a `.penpair` entry added to `.gitignore`.
- **Execution of project code**: the installed Marwes core is dynamically
  imported, and the project's theme module and component renderer are evaluated
  through `jiti`. This is trusted local code, not a sandbox.
- **stdout and stderr**, carrying structured JSON results and progress, plus a
  process exit code in the range 0–4.

## System Verification

- Run: `pnpm test` (from `packages/marwes-ui`)

Run `pnpm test` for the current file and test counts; they are not recorded here.

`pnpm check` is the repository's full gate — style and path checks, build,
typecheck, convention examples, tests and the version check — but its first step
shells out to `git ls-files`, so it cannot run in a tree without a `.git`
directory. `pnpm smoke:package` packs all six packages and must run before any
release.
