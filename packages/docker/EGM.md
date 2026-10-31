# @penpair/docker Blueprint

## System Overview

`@penpair/docker` is the second command package: the same `penpair` command as
`@penpair/web`, plus Penpot running in Docker on the user's own computer — one
instance per project, with generated secrets, `up` and `down`, and backup,
verify and restore.

Its architectural significance is that it is the **implementation of the core's
`LocalProfile` plug-in point**. `@penpair/core` declares that contract in
`packages/core/src/local-profile.ts` — `preflight`, `init`, `up`, `down`,
`status`, `doctor`, `backup`, `verifyBackup`, `restore` — and knows nothing about
Docker. This package supplies `dockerProfile` and passes it to `runCli`, so all
Docker knowledge in the repository lives behind one boundary. A test fails the
build if Docker code appears in the core.

A user installs exactly one command package, which is why the core has no
command of its own and why `@penpair/web` and this package never contend for the
bin name `penpair`.

There is no direct source at this level. `README.md` here is the published,
human-maintained npm readme and is not part of this contract. `test/`, `dist/`
and `node_modules/` are outside it too.

## Subdirectories & System Boundaries

- `src`: [./src/EGM.md](./src/EGM.md) — the whole implementation.
  `cli.ts` (the bin, `runCli(argv, { local: dockerProfile })`), `index.ts` (the
  barrel and `dockerProfile`), `init.ts` (scaffolding and port probes),
  `lifecycle.ts` (the seven lifecycle methods plus compose helpers;
  `preflight` is inline in `index.ts`),
  `secrets.ts` (generation and `0o600` file I/O) and `template.ts`
  (`renderCompose`).

## Global Invariants

- **Docker knowledge is confined to this package.** `@penpair/core` must never
  gain Docker code or a dependency on this package;
  `packages/core/test/boundary.test.ts` rejects core files named `compose`,
  `lifecycle`, `secrets` or `template` and asserts the core's `package.json`
  mentions this package nowhere.
- **One way only.** The dependency is `@penpair/core` at `workspace:*`, reached
  through its public entry. `LocalProfile` is imported from the core, never
  redefined.
- **The profile satisfies the contract exactly.** All nine members are supplied;
  `pnpm typecheck` is what catches a drifting `dockerProfile`.
- **Exactly one bin, named `penpair`**, pointing at `dist/cli.js` — the same
  name as `@penpair/web` and `penpair`, because they are alternatives.
- **Secrets never leave the instance directory.** The `.env` holding
  `PENPOT_SECRET_KEY` and `PENPOT_DATABASE_PASSWORD` is mode `0o600`, gitignored,
  passed to Docker only via `--env-file`, and never printed or logged. No secrets
  in the repository, in output or in logs.
- **Destructive operations are gated.** `restore` requires an explicit `yes`,
  checksums the backup against its manifest before touching anything, and takes
  a `pre-restore` safety backup by default.
- **One naming scheme per instance** (compose project, assets volume,
  `.penpair` directory). Never hand-build a parallel `docker compose`
  invocation.
- **The Penpot version is pinned** in the generated compose file; run the smoke
  test before bumping it.
- **All packages release together at one version.** Whatever version this
  package carries must equal every other package's and the literal in
  `packages/core/src/version.ts`. The number is not restated here; the manifests
  own it. Never bump by hand — `scripts/check-versions.mjs` fails `pnpm check`
  on drift; releases use Changesets and `pnpm version-packages`.
- **This package cannot be published on its own** (`prepublishOnly` runs
  `scripts/guard-publish.mjs`), and it is **required** in every release: the
  owner-approved exception may omit only the `penpair` wrapper. Never edit a
  guard to get a release through.
- **Published surface is `dist`, `LICENSE`, `README.md`, `docs` and
  `examples`.** `prepack` runs `scripts/copy-package-docs.mjs docker` to
  assemble `docs/` and `examples/`, which are generated and git-ignored; the
  repository holds the one source. `README.md` is **maintained here**, not
  generated: the copy script skips a package that already has one, so unlike
  `@penpair/web` this package keeps its own. `packages/core/test/release-guard.test.ts`
  fails the build if any promised top-level file is missing or if `LICENSE`
  differs from the repository's.
- **ESM, Node >= 22**; the exports map offers only `.` and `./package.json` —
  there is no `./cli` subpath here, unlike `@penpair/web`.

## Global Side Effects

- **The user's machine runs containers.** `docker compose up -d` / `down` /
  `ps`, `docker exec`, and `docker run --rm` against a per-project Penpot stack.
- **Project files are written**: `penpair.config.json` (committed), and inside
  `.penpair/` the generated `docker-compose.yml`, the `0o600` `.env`, and
  `backups/<timestamp>/{db.dump,assets.tgz,manifest.json}`. `.gitignore` is
  appended to when asked.
- **Postgres and the assets volume are mutated by `restore`**: drop and recreate
  the database, `pg_restore`, and wipe-then-untar the
  `<composeProject>_penpot_assets` volume.
- **Network**: readiness polling of `{frontendUrl}/readyz` on `up` (every 3 s,
  up to 240 s) and single probes on `status`. Published ports bind to
  `127.0.0.1` only.
- **Throwaway containers**: `verifyBackup` creates and always removes a
  `penpair-verify-<rand>` `postgres:15` container.
- Everything the core does when the command runs, since this package carries it.

## System Verification

- Run: `pnpm test` in
  `packages/docker`
  (`vitest run` over `test/init.test.ts`, `test/lifecycle.test.ts`,
  `test/template.test.ts`).
- Types and build: `pnpm typecheck` and `pnpm build` in the same directory.
- Boundary, publish-guard and single-version invariants: `pnpm test` in
  `packages/core`.
- End to end, from the repository root: `pnpm smoke:package`.
