# Release helper modules

## Overview

Shared, importable helpers behind the release and verification entry points in
[`scripts/`](../EGM.md). Every rule the repository refuses to bend about releasing
is encoded here rather than in the entry points: one version across all six
packages, Changesets as the only version author, trusted publishing with no
fallback token, and a pinned snapshot that must be an ancestor of `origin/main`.
The entry points orchestrate; these modules decide and refuse.

These are ES modules with named exports. None of them is a CLI.

## Interface

| Module | Exports |
| --- | --- |
| `changesets.mjs` | `checkReleaseGroup(root)` — validates `.changeset/config.json` is one fixed group holding every package exactly once, then returns the sorted package names; `pendingChangesets(root)` — lists `.changeset/*.md`; `syncSourceVersion(root)` — writes `packages/core/src/version.ts` from the Changesets-written `package.json` |
| `versions.mjs` | `guardScript` (`"node ../../scripts/guard-publish.mjs"`), `loadPackages(root)`, `sourceVersion(root)`, `checkVersions(root)` → `{ ok, version, packages, problems }`, `publishOrder(packages)` — topological dependency order, `isPublished(name, version, { timeoutMs })`, `latestPublishedVersion(name, { timeoutMs })` |
| `release-exclusions.mjs` | `releaseExclusions(value)` — parses `PENPAIR_RELEASE_EXCLUDE_PENPAIR`, returning `[]` or `["penpair"]` and nothing else; `releaseTargets(packages, value)` → `{ required, excluded }` |
| `release-auth.mjs` | `trustedPublishingContext(environment, versions)` → `{ mode, provenance, environment }`; `confirmReleaseVersion(expected, supplied)` |
| `release-snapshot.mjs` | `assertReleaseSha(sha)`, `assertReleaseHistory(root, sha)`, `assertReleaseSnapshot(root, sha)`, `assertReleaseProtocol(root, sha)` |
| `release-pr.mjs` | `isMergedReleasePr(pr, repository, sha)`, `assertVersionIncrease(previous, next)`, `checkReleaseCommit(root, previousVersion)` → the release version |
| `trusted-package.mjs` | `publishTrustedPackage({ root, packDirectory, package, run, sourceSha })` → `{ code, sha256, tarball }` |
| `publication-batch.mjs` | `publishPackageBatch(packages, publish, { concurrency })`, `verifyPackageVisibility(packages, version, options)` |
| `registry-polling.mjs` | `waitForRegistryVisibility(name, version, options)`; constants `registryPollIntervalMs` (60 s), `registryVisibilityTimeoutMs` (10 min), `registryQueryTimeoutMs` (30 s) |
| `layout-source.mjs` | `createLayoutSourceModule(sourceText)` — accepts the TypeScript source of `layout-settling.ts`, verifies structure (exactly one `settleLayout` function, no runtime imports), strips types and `export`, minifies via esbuild, and formats the result via a biome subprocess. Returns the generated TypeScript module source string. |
| `release-smoke-inputs.mjs` | `createReleaseSmokeInputs(root, hashContract)` — creates a `release-evidence/` directory under `root` and writes four synthetic JSON files (inspection, journey, integration, adoption) the package smoke test uses to exercise installed release planning without a live Penpot instance. |

Pure (no I/O): `release-exclusions.mjs`, `release-auth.mjs`, `release-pr.mjs`'s
`isMergedReleasePr` and `assertVersionIncrease`, `publishOrder`.
`layout-source.mjs` spawns a biome subprocess; `release-smoke-inputs.mjs` writes to disk.
Everything else reads disk, spawns a child process, or reaches the npm registry.

## Invariants

- **One version, always.** `checkVersions` fails unless every `packages/*/package.json`
  and the constant in `packages/core/src/version.ts` carry the identical version.
  `checkReleaseGroup` independently fails unless `.changeset/config.json` declares a
  single fixed group containing every package exactly once, with no `linked` or
  `ignore` entries, `access: public` and `baseBranch: main`.
- **Stable versions only.** `x.y.z` with no prerelease or build tag.
- **Every package keeps its own refusal.** `checkVersions` fails unless each
  `package.json` sets `prepublishOnly` to exactly `guardScript`. A package that
  loses that line fails the version check rather than becoming publishable alone.
- No package under `packages/` may be private; internal dependencies between
  repository packages must be `workspace:*`; the `types` condition must come first
  in every `exports` block.
- **The exclusion is narrow.** `releaseExclusions` accepts only `"true"`, `"false"`
  or unset for `PENPAIR_RELEASE_EXCLUDE_PENPAIR`, and only ever excludes the
  `penpair` wrapper. `releaseTargets` additionally refuses if any required package
  depends on an excluded one. Repository versions still move together.
- **A release commit is a merged release PR.** `isMergedReleasePr` requires a merged
  PR with `base: main` and `head: changeset-release/main` from the same repository,
  whose `merge_commit_sha` is the SHA under inspection. `checkReleaseCommit` requires
  zero pending changesets and a strictly increasing version.
- **Trusted publishing has no fallback.** `trustedPublishingContext` requires
  `GITHUB_ACTIONS=true`, `GITHUB_REF=refs/heads/main`, an allowed `GITHUB_EVENT_NAME` (`workflow_dispatch` always; `push` only when `PENPAIR_RELEASE_PR` matches `/^[1-9]\d*$/`),
  both `ACTIONS_ID_TOKEN_REQUEST_URL` and `ACTIONS_ID_TOKEN_REQUEST_TOKEN`,
  `PENPAIR_RELEASE_ENVIRONMENT=npm-release`, Node >= 22.14.0 and npm >= 11.5.1 — and
  fails if `NODE_AUTH_TOKEN` or `NPM_TOKEN` is set at all.
- **The release SHA is pinned.** 40 hex characters, an ancestor of `origin/main`,
  matching the checked-out `HEAD`, and carrying `scripts/release-protocol.json`
  with `version: 1` at that commit.
- Publication concurrency is an integer 1–3 and is fail-stop: the first failure
  stops scheduling, and already-scheduled publishes are allowed to settle.
- `syncSourceVersion` is the only sanctioned writer of `packages/core/src/version.ts`.
  Never edit a version by hand.

## Side Effects

- **Disk reads:** `.changeset/config.json`, `.changeset/*.md`, `packages/*/package.json`,
  `packages/core/src/version.ts` (`changesets.mjs`, `versions.mjs`, `release-pr.mjs`).
- **Disk writes:** `packages/core/src/version.ts` (`changesets.mjs` `syncSourceVersion`);
  a per-package pack directory (`trusted-package.mjs`);
  `release-evidence/*.json` synthetic inputs (`release-smoke-inputs.mjs`).
- **Non-git subprocesses:** `layout-source.mjs` runs `biome format` via `execFileSync`
  to format the generated module source.
- **Git subprocesses** (`release-snapshot.mjs`): `git merge-base --is-ancestor <sha> origin/main`,
  `git rev-parse HEAD`, `git show <sha>:scripts/release-protocol.json`.
- **Network, read-only:** `npm view <name>@<version> version --json` and
  `npm view <name> dist-tags.latest --json` with `--fetch-retries=0`
  (`versions.mjs`); `registry-polling.mjs` repeats the first of those on a 60-second
  interval under a 10-minute ceiling.
- **Network, irreversible:** `trusted-package.mjs` runs `node scripts/guard-publish.mjs`,
  then `pnpm pack`, then `npm publish <tarball> --access public --provenance` with
  `PENPAIR_RELEASE=1` and `GITHUB_SHA` set. It validates the tarball is 1–128 MB and
  records its SHA-256. **A publish cannot be undone.** Publishing is the owner's act.
- `publication-batch.mjs` schedules the callbacks it is given, but `verifyPackageVisibility` calls `waitForRegistryVisibility`, which queries the npm registry by default.

## Verification

- This directory holds no test files, but ten of the eleven modules are
  unit-tested from `packages/core/test/` and reached by `pnpm test`:
  `release-guard.test.ts` (versions), `changesets.test.ts` (changesets and
  release-pr), `release-exclusions.test.ts`, `release-auth.test.ts`,
  `release-snapshot.test.ts`, `trusted-package.test.ts`,
  `publication-batch.test.ts`, `registry-polling.test.ts`,
  `registry-query.test.ts` and `layout-source.test.ts` (layout-source).
  `release-smoke-inputs.mjs` is exercised by `pnpm smoke:package`, not by
  `pnpm test`.
- Read-only consistency check, from the repository root: `node scripts/check-versions.mjs`
  (exercises `checkVersions` and `checkReleaseGroup`).
- The repository's full gate is `pnpm check`. It cannot run in this working tree:
  its first step shells out to `git ls-files` and there is no `.git` directory here.
- Do not run `scripts/release.mjs`, `scripts/ci-release.mjs` or anything that calls
  `publishTrustedPackage` as verification. They publish.
