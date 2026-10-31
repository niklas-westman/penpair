# Penpair Blueprint

Architectural contracts for this repository, generated with the Elephant-Goldfish
Model bootstrap. `README.md` remains the human and npm front page; this file and
its siblings are the agent-facing map. Each code-bearing directory carries its own
`EGM.md` stating that directory's interface, invariants and side effects.

## System Overview

Penpair connects an AI agent and a person to the same Penpot design file, safely.
An agent reaches Penpot over a streamable-HTTP MCP transport and executes
JavaScript inside Penpot's plugin sandbox; a person reviews what came out. The
whole system is arranged around one problem: an agent that cannot see is editing a
visual document that a human owns.

Three ideas carry most of the design.

**The write protocol.** Every change to a Penpot file is read-only inspect, a
pinned snapshot, exactly one idempotent write, an independent readback, and an
export that is looked at — twice, because the first export after a write or a page
switch can be stale. A write is guarded three ways: an in-snippet file-and-revision
check, a local lock plus a shared in-file lease, and a serialised page session that
aborts on external navigation. Only reads are retried; a write whose acknowledgment
is lost becomes an explicitly uncertain outcome rather than a silent retry.

**The neutral core.** `@penpair/core` is a framework and must stay free of the
projects that adopt it. Project and component-library knowledge lives in adapters,
in the adopting project, or in the examples — never in the core, enforced by a test
that scans source and documentation alike.

**Evidence is not approval.** The system produces evidence — verified readbacks,
structural snapshots, pixel-exact comparisons, byte-stable exports — and binds owner
review to artifact hashes. An agent can gather evidence; it cannot approve, and
nothing in the pipeline promotes evidence into sign-off.

## Local Interface & Invariants

The repository root holds no source. Its files are the manifests, the workspace
definition, the shared TypeScript base, the formatter configuration, the
changeset configuration and the instruction files.

- `package.json` — the script surface: `pnpm check` (the full gate),
  `pnpm format`, `pnpm test` (`pnpm -r test`, which reaches `packages/*` only),
  `pnpm conventions:check`, `pnpm smoke:package`, `pnpm release`.
- `pnpm-workspace.yaml` — workspace members are `packages/*` and nothing else.
- `tsconfig.json` — the shared TypeScript base (`ES2022`, `strict`,
  `noUncheckedIndexedAccess`) that every package and `docs/conventions` extends;
  `pnpm typecheck` depends on it.
- `biome.json` — the formatting authority, with raw plugin bodies under
  `examples/` deliberately excluded.
- `AGENTS.md` — the project instructions an agent must read first. Rules that do
  not bend: the neutral core, no secrets anywhere, the write protocol, the 90 KB
  snippet limit, and a pinned Penpot version.
- `.changeset/` — a single fixed release group containing every package exactly
  once.

## Subdirectories & System Boundaries

- **packages**: [./packages/EGM.md](./packages/EGM.md) — the six published
  packages at one version: the engine, two command packages, a short-name wrapper
  and two adapters.
- **docs**: [./docs/EGM.md](./docs/EGM.md) — maintained documentation, plus the
  executable convention examples that are typechecked and run.
- **examples**: [./examples/EGM.md](./examples/EGM.md) — runnable starting points
  for adopting projects: worked instances of the write protocol as raw sandbox
  bodies, deliberate failure-path trials, and browser measurement starters.
- **scripts**: [./scripts/EGM.md](./scripts/EGM.md) — the release and verification
  enforcement layer: version and changeset checks, the publish guard, the CI
  release gate, documentation generation and the smoke tests.
- **skills**: [./skills/EGM.md](./skills/EGM.md) — the installable setup guide.
  It also holds `references/poc-snippet.mjs`, so the directory is code-bearing
  and is one of the code roots `scripts/check-code-paths.mjs` scans.
- **.github**: `workflows/` holds `ci.yml`, `release.yml`, `version-pr.yml` and
  `live-smoke.yml`. Not inert configuration — `packages/core/test/changesets.test.ts`
  extracts and executes the shell body embedded in `ci.yml` and asserts the
  structure of `version-pr.yml` and `release.yml` field by field. Nothing reads
  `live-smoke.yml`; only `live-smoke.test.ts` covers the code it invokes.
- **.agents**: `skills/penpair-code-conventions/SKILL.md`, which `AGENTS.md`
  directs agents to before writing or refactoring code.
- **docker**: holds a single `README.md` and no source; no contract file.

## Global Invariants

- **The write protocol applies to every Penpot change**, without exception, and
  the look-twice rule is part of it.
- **Neutral core**: `packages/core` names no adopting project or component
  library, in code, comment or documentation.
- **The dependency runs one way**: command packages and adapters depend on the
  core; the core depends on none of them and names neither adapter.
- **One version across all six packages**, in every manifest and in
  `packages/core/src/version.ts`. Never bumped by hand. No package can publish
  alone, `pnpm release` is the only path, and publishing is the owner's act.
- **No secret in the repository, in output or in logs.** The MCP URL carries a
  personal key. When `connect` is given a pasted URL it lives in `.env.local` at
  mode `0600` and is git-ignored before the write returns; a configured credential
  reference (file or keychain) or `PENPAIR_MCP_URL_FILE` keeps it outside the
  repository, and `connect` then does not copy it into `.env.local`
  ([docs/credentials.md](./docs/credentials.md)). Error text has the full URL,
  its query and the `userToken` value replaced with `[redacted]`.
- **Snippets stay under 90 KB**; Penpot's proxy refuses bodies around 110 KB.
  Kit sources are held to a per-source and a combined byte ceiling, enforced in
  `packages/core/src/kit.ts`. The numbers have one canonical home in
  [docs/build-kit.md](./docs/build-kit.md); do not restate them here, or the two
  will disagree. Measure the **built** output and run the adapter packages'
  tests, not only `packages/core`'s — a change can pass there and still fail a
  package that imports the built core.
- **Sandbox JavaScript is generated at a developer step, never serialised at
  runtime.** `settleLayout` is written once as TypeScript and committed as a
  string in `packages/core/src/generated/`. `pnpm sandbox:generate` regenerates
  it; `packages/core`'s `build` script runs the same generator with `--check`,
  so a stale artifact fails `pnpm build` and therefore `pnpm check`. This is
  what keeps kit bytes identical across source, build and test transforms.
- **A write target is an owner-authorized file.** Any write to a Penpot instance
  other than a scratch one needs the owner's go-ahead, as do push, tag, publish,
  version bumps and deploys.
- **The Penpot version is pinned**; run the smoke test before bumping it.
- **Evidence is never approval**, and a failed hash, fingerprint or file pin is
  always a hard error while findings stay advisory.
- **Guards are never edited to get a release through.**
- **Internal reports and private evidence live in git-ignored `.working-docs/`**,
  and published documentation never links into it.

## Global Side Effects

- **Penpot**: one MCP tool call at a time over a persistent transport; design
  files mutated only behind `--apply`.
- **The adopting project's tree**: `penpair.config.json`, `.env.local` at `0600`,
  `.gitignore` entries, `design/` artifacts, and the git-ignored `.penpair/`
  holding locks, journalled runs and private evidence — every write atomic,
  path-bounded to the project root and symlink-aware.
- **The local machine**: shell-less process spawning, a loopback browser debug
  connection for the native clipboard, Docker containers and volumes under the
  Docker command package, and browsers plus loopback servers under the example
  providers.
- **npm**: irreversible publication through `pnpm release`.
- **CI**: the release gate detaches the working tree at the release SHA and sets
  workflow outputs.

## System Verification

- **Full gate**: `pnpm check` — style and code-path checks, build, typecheck,
  the executable convention examples, the test suites and the version check.
  It requires a git working tree, because `scripts/check-code-paths.mjs` shells
  out to `git ls-files`; in a tree without `.git`, run `biome check .`,
  `pnpm build`, `pnpm typecheck`, `pnpm conventions:check`, `pnpm test` and
  `node scripts/check-versions.mjs` individually.
- **Before any release**: `pnpm smoke:package`.
- **Optional, owner-driven**: `pnpm smoke:browser` (local Playwright) and
  `pnpm smoke:live` (an owner-confirmed scratch Penpot file and an explicit
  `PENPAIR_MCP_URL`).
