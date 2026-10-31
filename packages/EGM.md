# packages

## Overview

Six published packages at one version. The split exists to keep three things
apart: the engine, the command that runs it, and the project-specific knowledge
that must never reach the engine.

`@penpair/core` is the library and engine and has **no command of its own**. The
two command packages depend on it and it depends on none of them, so a user
installs exactly one command and the packages never contend for the name
`penpair`. `@penpair/web` drives Penpot on the web and is the default;
`@penpair/docker` is the same command plus Penpot in Docker, and it is the sole
implementation of the core's `LocalProfile` plug-in point, which is what confines
every Docker detail behind one boundary. `penpair` is a three-line wrapper for
`@penpair/web` so that `npx penpair setup` works with the short name.

The two adapters sit on the other side of the same boundary. `@penpair/marwes-ui`
carries a component library's token and component knowledge; `@penpair/reflection-check`
plans which approved baselines may be checked and then polices the evidence a
project's browser provider returns. Both plug in through `defineAdapter`, are
loaded from the adopting project's `adapters` list. The core does not name the
Marwes adapter; its skills do name `@penpair/reflection-check` as a companion.

## Subdirectories & Boundaries

- **core**: [./core/EGM.md](./core/EGM.md) — the engine: command dispatch, the MCP
  transport, the five-phase write protocol with its revision guard, write lease,
  page session and journal, the sandbox build kits, the skill installer, and the
  design-artifact layer.
- **web**: [./web/EGM.md](./web/EGM.md) — the default command package. Two files:
  a bin that hands `process.argv` to `runCli`, and a barrel re-exporting the core.
- **docker**: [./docker/EGM.md](./docker/EGM.md) — the same command plus a local
  Penpot stack; supplies `dockerProfile` satisfying the core's nine-method
  `LocalProfile`.
- **penpair**: [./penpair/EGM.md](./penpair/EGM.md) — the short unscoped npm name;
  a `bin` shim that side-effect-imports `@penpair/web/cli` and nothing else.
- **marwes-ui**: [./marwes-ui/EGM.md](./marwes-ui/EGM.md) — adapter carrying design-token
  and component-library knowledge, with the ownership ledger that distinguishes an
  upstream change from a designer's edit.
- **reflection-check**: [./reflection-check/EGM.md](./reflection-check/EGM.md) —
  adapter that plans eligible baseline cases and validates provider evidence.
  Never drives a browser and never approves anything.

## Global Invariants

- **The dependency runs one way.** Adapters and command packages depend on
  `@penpair/core`; the core imports from none of them. Enforcement is split across
  two tests and does not cover every limb: `boundary.test.ts` asserts the one-way
  rule against `@penpair/docker` only, and that `@penpair/web` and `@penpair/docker`
  import the core through its public entry rather than a deep `dist/` path. It says
  nothing about either adapter. Nothing tests that an adapter imports the core at a
  sane depth. Naming is a separate matter, see the next invariant.
- **Neutral core.** No file under `packages/core/src` or `packages/core/skills`
  may name an adopting project or component library, in code, comment or
  documentation. `packages/core/test/neutrality.test.ts` fails the build on a
  case-insensitive substring hit from a short forbidden list (two project names and
  the Marwes library), so the core is kept free of the Marwes adapter and of named
  projects. It scans every file under `packages/core/src` and `packages/core/skills`
  (so the contract files inside `core/src` are in scope) and `packages/docker/src`;
  this file and the other contracts outside those directories are not scanned. The
  list does not cover `@penpair/reflection-check`: core's shipped skills name it as
  the recommended companion for frontend verification, and no test forbids that.
- **An adapter's surface is bounded.** It may contribute CLI commands, an optional
  `status()` line and build kits. It may not register MCP tools or registry
  snippets, and it may not claim one of the 42 reserved command names — which is
  why the Marwes command is `marwes` with `tokens` as a subcommand, since both
  `tokens` and `snapshot` are reserved.
- **One version, always.** All six packages release together, every
  `package.json` and `packages/core/src/version.ts` carrying the identical
  `x.y.z`. No version is ever bumped by hand: Changesets plus
  `pnpm version-packages` is the normal author and `pnpm bump` is an owner-led
  emergency tool.
- **No package can publish alone.** Every `package.json` sets `prepublishOnly` to
  the publish guard, and the version check fails if any package loses that line.
  `pnpm release` is the only sanctioned path and publishing is the owner's act.
  The one approved exception may omit only the `penpair` wrapper from npm; all
  six repository versions still move together and the omission must be reported.
- **A package ships every file it promises.** Each `files` array lists `LICENSE`,
  so each package directory holds a copy that is byte-identical to the
  repository's. `packages/core/test/release-guard.test.ts` fails the build on a
  promised top-level file that is missing or a `LICENSE` that differs. Only
  `@penpair/web`'s `README.md` is exempt, because `prepack` generates it.
- **The write protocol is not optional.** Any Penpot change is read-only inspect,
  a pinned snapshot, one idempotent write, an independent readback, and an export
  that is looked at — twice, because a first export after a write or a page switch
  can be stale.
- **No secret in the repository, in output or in logs.** The MCP URL carries a
  personal key; it lives in `.env.local` at mode `0600`, is replaced by the literal
  `[redacted]` (URL, query and `userToken`) by `redactEndpoint` before any error is
  thrown — only `EndpointDescription` keeps origin and pathname — and `PENPAIR_MCP_URL_COMMAND` is refused
  outright.
- **Ceilings are enforced, not advisory.** Snippets stay under 90 KB
  (`maxSnippetBytes = 90 * 1024` in `core/src/client.ts`, checked when a snippet is
  constructed) because Penpot's proxy refuses bodies around 110 KB. Kit sources
  are capped per kit and combined, as inline literals in `core/src/kit.ts`
  (`checkKits` enforces the combined cap; `kit.test.ts` asserts only that the
  core kit stays under the per-kit cap, and no test measures headroom). Headroom is small, so a new helper belongs in an included kit such as `@instances` — and the budget is
  measured against whichever copy the consumer loads, which is why a change can
  pass `packages/core`'s own tests and still fail an adapter package that imports
  the built core.
- **Evidence is never approval.** A pixel ratio, a passing smoke run or a verified
  readback is evidence; owner review stands separately and is bound
  cryptographically to the artifact hash it approved.

## Global Side Effects

- **Penpot**: a streamable-HTTP MCP transport, one tool call at a time; writes
  only behind `--apply`, and only the core and the Marwes adapter ever mutate a
  design file.
- **The project tree**: `penpair.config.json`, `.env.local` at mode `0600`,
  appended `.gitignore` entries, `design/` artifacts (approvals, baselines, shots,
  specs, releases) and the git-ignored `.penpair/` holding locks, journalled runs
  and private evidence. Design artifacts are written atomically; `penpair.config.json`,
  `.env.local` and the appended `.gitignore` entries are not, and lock files use
  exclusive create (`wx`).
- **The local machine**: shell-less process spawning; a loopback browser debug
  connection for the native clipboard; Docker containers, volumes and a `0600`
  `.env` under `@penpair/docker`; browsers and loopback servers under the
  adapters' providers.
- **npm**: irreversible publication, reachable only through `pnpm release`.

## System Verification

- Per package: `pnpm test` from that package directory. Note that `@penpair/web`
  and `penpair` declare no `test` script and have no test directory — their
  behaviour is covered from the core.
- The real cross-package gate is `pnpm test` in `packages/core`:
  `test/boundary.test.ts` enforces the one-way dependency and the public-entry
  import rule, `test/neutrality.test.ts` the neutral core,
  `test/release-guard.test.ts` and `test/release-exclusions.test.ts` the publish
  guards and the wrapper-only exception, and `test/changesets.test.ts` the
  changeset rules.
- Whole repository: `pnpm check`. It cannot run in a tree without a `.git`
  directory, because its first step shells out to `git ls-files`; run the stages
  individually there.
- Before any release: `pnpm smoke:package`, which packs all six packages,
  installs them into empty projects and runs them.
