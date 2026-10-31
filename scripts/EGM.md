# Release and verification tooling

## Overview

The workspace's enforcement layer. These scripts are the reason the repository's
release rules are facts rather than intentions: all six packages
(`@penpair/core`, `@penpair/web`, `@penpair/docker`, `penpair`,
`@penpair/marwes-ui`, `@penpair/reflection-check`) move to one version together,
no version is ever written by hand, each package refuses to publish on its own,
and only `pnpm release` can publish the set. Alongside that sit the verification
scripts — version consistency, code-path naming, changeset presence, and the
package, browser and live smoke tests.

Almost every file here is a side-effecting entry point invoked through a root
`package.json` script, not a library. The importable logic lives in
[`lib/`](./lib/EGM.md). Five files are the exception and export a function that
is tested elsewhere: `check-code-paths.mjs`, `release-gate.cjs`,
`generate-troubleshooting.mjs`, `generate-skill-index.mjs` and
`generate-layout-source.mjs`. Only some are pure.

## Interface

### Guards and checks (read-only)

| Entry point | Invoked as | Contract |
| --- | --- | --- |
| `guard-publish.mjs` | every package's `prepublishOnly` | Exits 1 unless `PENPAIR_RELEASE === "1"`, then exits 1 on any version inconsistency. This is what makes a lone `pnpm publish` impossible. |
| `check-versions.mjs` | `pnpm check:versions`, last step of `pnpm check` | Runs `checkVersions(root)` and `checkReleaseGroup(root)`. |
| `check-code-paths.mjs` | `pnpm check:style` | **Exports `findInvalidCodeDirectories(filePaths)`** (pure). As a CLI it shells out to `git ls-files --cached --others --exclude-standard -z`, so it covers untracked files — and so it **needs a git checkout or worktree**. |
| `check-pr-changeset.mjs` | CI | Requires a new `.changeset/<id>.md` (never `README.md`) when `packages/` or `scripts/` changed. Reads `PENPAIR_PR_BASE_SHA`, `PENPAIR_PR_HEAD`. When `PENPAIR_PR_HEAD` is `changeset-release/main` it runs `checkReleaseCommit` instead; any other PR that changes the source version throws "Only the reviewed Changesets version PR may bump versions". |
| `release-gate.cjs` | GitHub Actions | **Exports `releaseGate({ github, context, core, root })`.** The CI gate that decides whether a publish may happen at all. In order: release-history check, merged-release-PR lookup for the SHA, protocol check, `git checkout --detach`, snapshot check, then the committed-version check. A push whose SHA has no merged release PR does not throw: it logs that nothing is to publish and sets `publish` to `false`; only `workflow_dispatch` throws there. The other outputs are set only on a full pass. |

### Release flow (mutating)

| Entry point | Invoked as | Contract |
| --- | --- | --- |
| `version-packages.mjs` | `pnpm version-packages` | The sanctioned version author: `checkReleaseGroup`, `checkVersions` and a pending-changesets check (throws if none), then `pnpm changeset version`, then `syncSourceVersion()` (throws "Changesets did not bump the package family" if the version is unchanged), then a check that no changesets remain, then `pnpm install --lockfile-only --ignore-scripts`. Run on the generated release PR. |
| `bump.mjs` | `pnpm bump <patch\|minor\|major\|x.y.z>` | **Owner-led emergency tool only.** Writes every `packages/*/package.json` and `packages/core/src/version.ts`. |
| `release.mjs` | `pnpm release` | The only sanctioned publish path. Dry run by default, but the dry run still runs `pnpm check` and `pnpm smoke:package`, requires a clean working tree and runs `git fetch origin main`; without `--release-sha` it requires branch `main` equal to `origin/main`. `--publish` publishes, prompting for the version on a TTY unless `--confirm-version` is given. Also `--continue`, `--except <name>`, `--otp <code>`, `--trusted-publishing`, `--confirm-version`, `--release-sha`. |
| `ci-release.mjs` | CI | Wraps `pnpm release --publish --trusted-publishing --release-sha <sha> --confirm-version <v>` (plus `--continue` when `PENPAIR_CONTINUE_RELEASE` is `true`); requires `PENPAIR_EXPECTED_VERSION` to match `x.y.z` and `PENPAIR_CONTINUE_RELEASE` to be exactly `true` or `false`. Writes the GitHub step summary. |
| `release-protocol.json` | read at the release SHA | `{ "version": 1 }` — the protocol marker `assertReleaseProtocol` requires. |

### Documentation and smoke tests

| Entry point | Invoked as | Contract |
| --- | --- | --- |
| `generate-troubleshooting.mjs` | `pnpm docs:generate` | **Exports `troubleshootingMarkdown()`**; as a CLI writes `docs/troubleshooting.md` from `@penpair/core`'s `errorRemedies` (needs a built core). |
| `generate-skill-index.mjs` | `pnpm docs:generate` | **Exports `skillIndexMarkdown()`** (async); as a CLI writes `docs/skills.md` from the bundled skills' own `name`/`description` metadata via `@penpair/core`'s `listBundledSkills` and `parseSkillMetadata` (needs a built core). Links are absolute GitHub URLs (`sourceUrl` in the script) rather than relative paths, so the page's links resolve wherever the page is read. |
| `copy-package-docs.mjs` | `prepack` of `@penpair/web` and `@penpair/docker` | Copies the repository `README.md`, `docs/` and `examples/` into `packages/<target>/` for the tarball. It accepts six targets and defaults to `core` when given none; only `packages/web/package.json` and `packages/docker/package.json` invoke it, every other package's `prepack` is plain `pnpm build`, and `penpair` has no `prepack` at all. A package that maintains its own `README.md` keeps it; only a package without one receives the project README. It recursively force-removes `packages/<target>/docs` and `packages/<target>/examples` before re-copying; the docs copy excludes `assets`, `designs`, `node_modules` and `.working-docs`, and the examples copy excludes `node_modules`, `artifacts`, `.penpair` and `.working-docs`. |
| `generate-layout-source.mjs` | `pnpm sandbox:generate`; `pnpm sandbox:check`; and as `--check` inside the core's `build` script | **Exports `updateLayoutSource({ sourcePath, outputPath, check })`**. Reads `packages/core/src/layout-settling.ts`, verifies it contains exactly one `settleLayout` function with no runtime imports, strips types and the `export` keyword, minifies via esbuild, formats via biome, and writes the result as a TypeScript string constant to `packages/core/src/generated/layout-settling-source.ts`. With `check: true` it throws `"Sandbox source is missing or stale; run pnpm sandbox:generate"` instead of writing. Because the core's `build` script runs `--check`, a stale or missing generated file fails `pnpm build` and therefore `pnpm check`. `pnpm sandbox:generate` is the deliberate developer action that regenerates it. |
| `smoke-package.mjs` | `pnpm smoke:package` | Packs all six packages, installs them into empty projects, runs the commands and typechecks the declarations. Reads `scripts/fixtures/kit-consumer-check.mjs` as the consumer check. |
| `smoke-browser.mjs` | `pnpm smoke:browser` | Plumbing trial for [`examples/reflection-browser`](../examples/reflection-browser/EGM.md). |
| `smoke-live.mjs` | `pnpm smoke:live` | Live Penpot trial. Requires `--scratch-file`, `--origin`, `--expected-version`, `--confirm-scratch` and `PENPAIR_MCP_URL`. |

### Subdirectories

- [`lib/`](./lib/EGM.md) — the importable release helpers: version consistency,
  Changesets validation, exclusions, trusted-publishing auth, snapshot pinning,
  release-PR validation, packing/publishing, batching and registry polling.

## Invariants

- **One version, always.** All six packages, every `package.json` and the constant in
  `packages/core/src/version.ts` carry the identical stable `x.y.z`. `pnpm check`
  fails on any drift.
- **No version is ever bumped by hand.** `version-packages.mjs` (Changesets-driven)
  is the normal author; `bump.mjs` is an owner-led emergency tool. Editing a version
  manually is the mistake these scripts exist to catch.
- **A package can never publish alone.** `guard-publish.mjs` runs as every package's
  `prepublishOnly` and refuses unless `PENPAIR_RELEASE=1`, which only the release path
  sets. `lib/versions.mjs` additionally fails the version check if any package loses
  that `prepublishOnly` line.
- **`pnpm release` is the only way to publish.** Publishing is the owner's act.
- **Never edit a guard to get a release through.** If a guard is wrong, say so.
- **Code directory names are kebab-case** under `packages/`, `scripts/`, `examples/`, `skills/`
  and `docs/conventions/`, for files matching `/\.(?:[cm]?[jt]s|tsx)$/`, including
  untracked ones.
- **A PR touching `packages/` or `scripts/` must add a changeset.**
- **A release commit must be a merged release PR on `main`.** `release-gate.cjs`
  throws unless `context.ref` is `refs/heads/main` and the event is `push` or
  `workflow_dispatch`, then asserts release history, looks up the merged release PR
  for that SHA, and asserts protocol and snapshot. A `push` with no such PR only
  sets `publish=false`; a manual dispatch throws.
- **Trusted publishing is pinned and token-free.** `--trusted-publishing` requires an
  explicitly reviewed `--release-sha`, and is incompatible with `--otp` and `--except`.
- **An incomplete release is reported, not hidden.** When not every required package
  is visible on npm at the version, `release.mjs` exits **3** (`INCOMPLETE`) and says
  so; an upload failure exits **2**. With `PENPAIR_RELEASE_EXCLUDE_PENPAIR=true` and
  every required package visible, it prints an `EXCEPTION` message naming the excluded
  package and exits 0. `--continue` publishes only what is missing; accepted
  uploads are never replayed.
- **The exclusion exception is narrow.** `PENPAIR_RELEASE_EXCLUDE_PENPAIR=true` may
  omit only the `penpair` wrapper from npm publication. All six repository versions
  still move together, every other package is required, and the omission must be
  reported.
- **`smoke-live.mjs` never falls back to global agent configuration.** It requires
  `PENPAIR_MCP_URL` explicitly. **That URL carries a personal key: never print it,
  never log it, never commit it.**
- A live smoke run targets only an owner-confirmed scratch Penpot file, and follows
  the write protocol: read-only inspect, pinned snapshot, one idempotent write,
  independent readback, an export that is looked at — looked at **twice**, because a
  first export after a write or a page switch can be stale.
- `pnpm smoke:package` runs before any release.

## Side Effects

- **Irreversible, network:** `release.mjs` with `--publish` (and `ci-release.mjs`,
  which calls it) **publishes tarballs to npm**: through `lib/trusted-package.mjs` with
  `--trusted-publishing` (concurrency 3), otherwise `pnpm publish --access public`
  with `PENPAIR_RELEASE=1` (concurrency 1). `ci-release.mjs` always uses the trusted
  path. A publish cannot be undone.
- **Source writes:** `bump.mjs` and `version-packages.mjs` rewrite every
  `packages/*/package.json`, `packages/core/src/version.ts` and the lockfile.
  `generate-troubleshooting.mjs` writes `docs/troubleshooting.md` and
  `generate-skill-index.mjs` writes `docs/skills.md`; both are byte-compared, so
  editing either page by hand fails the suite.
  `generate-layout-source.mjs` writes `packages/core/src/generated/layout-settling-source.ts`
  (in generate mode) or throws on staleness (in check mode).
- **Recursive deletes:** `copy-package-docs.mjs` removes `packages/<target>/docs` and
  `packages/<target>/examples` with `recursive: true, force: true` before re-copying
  them, so removed working documents cannot linger. Those copies are generated and
  git-ignored; the repository holds the one source.
- **Git subprocesses:** `check-code-paths.mjs` (`git ls-files`),
  `check-pr-changeset.mjs` (`git diff`, `git show`), `release.mjs` (`git status
  --porcelain`, `git fetch origin main`, `git rev-parse`), `release-gate.cjs`
  (**`git checkout --detach <releaseSha>`** — it moves the working tree — plus
  `git show`), and `lib/release-snapshot.mjs`.
- **Live Penpot writes:** `smoke-live.mjs` connects to a Penpot instance and may
  create or modify content in the confirmed scratch file.
- **Browser and server processes:** `smoke-browser.mjs` forks
  `examples/reflection-browser/serve.mjs`, launches Playwright Chromium, and writes
  screenshots into a `mkdtemp` directory.
- **Temporary directories and package managers:** `smoke-package.mjs` and
  `release.mjs` create `mkdtemp` directories and spawn `pnpm pack`, `npm install`,
  `npx`, `node`, `tsc`, `npm whoami` and `npm view`.
- **CI outputs:** `ci-release.mjs` appends to `GITHUB_STEP_SUMMARY`;
  `release-gate.cjs` sets GitHub Actions outputs (`version`, `release_pr`,
  `release_sha`, `publish`).
- **Read-only, no writes:** `guard-publish.mjs`, `check-versions.mjs`,
  `check-code-paths.mjs`, `check-pr-changeset.mjs`.
- Environment variables read here: `PENPAIR_RELEASE`, `PENPAIR_RELEASE_SHA`,
  `PENPAIR_EXPECTED_VERSION`, `PENPAIR_CONTINUE_RELEASE`,
  `PENPAIR_RELEASE_EXCLUDE_PENPAIR`, `PENPAIR_PR_BASE_SHA`, `PENPAIR_PR_HEAD`,
  `PENPAIR_MCP_URL`, `GITHUB_STEP_SUMMARY`; for `smoke-browser.mjs`,
  `PENPAIR_PLAYWRIGHT_MODULE`, `PENPAIR_BROWSER_EXECUTABLE` and
  `PENPAIR_BROWSER_CHANNEL` (it sets `PENPAIR_EXAMPLE_PORT` for the server it forks); and, through `lib/release-auth.mjs` for
  trusted publishing, `PENPAIR_RELEASE_PR`, `PENPAIR_RELEASE_ENVIRONMENT`, `GITHUB_*`
  and `ACTIONS_ID_TOKEN_*`.

## Verification

- This directory holds no test files, but it is **not untested**: twelve suites
  under `packages/core/test/` reach into it and are run by `pnpm test`. They cover
  `release-gate.cjs`, `generate-troubleshooting.mjs` (byte-compared against
  `docs/troubleshooting.md`), `generate-skill-index.mjs` (byte-compared against
  `docs/skills.md`), `generate-layout-source.mjs`, `copy-package-docs.mjs`,
  `guard-publish.mjs`, `bump.mjs`, `release.mjs`, `ci-release.mjs` and
  `check-pr-changeset.mjs`, plus every module in `lib/` except `release-smoke-inputs.mjs`,
  which is exercised by `pnpm smoke:package`. `findInvalidCodeDirectories` is additionally exercised
  from
  [`docs/conventions/templates/conventions.test.ts`](../docs/conventions/templates/EGM.md)
  via `pnpm conventions:check`, which is what makes it runnable without git.
- Read-only checks, from the repository root: `node scripts/check-versions.mjs`.
  `node scripts/check-code-paths.mjs` needs a git checkout or worktree.
- The repository's full gate is `pnpm check` (style, build, typecheck, convention
  examples, tests, version check). It needs a git checkout or
  worktree, because `check-code-paths.mjs` shells out to `git ls-files`. In a source
  copy without `.git`, run the stages individually and report partial validation.
- Before any release: `pnpm smoke:package`.
- **Do not run anything here as a casual verification step.** `release.mjs`,
  `ci-release.mjs`, `bump.mjs`, `version-packages.mjs`, `copy-package-docs.mjs`,
  `generate-troubleshooting.mjs`, `generate-skill-index.mjs` and `smoke-live.mjs`
  all mutate something — a registry, the repository's versions, the working tree,
  or a live Penpot file.
