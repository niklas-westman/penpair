# Releasing

All packages in this repository are released **together, at one version, even a package that did not change**: `@penpair/core`, `@penpair/web`, `@penpair/docker`, `@penpair/marwes-ui`, `@penpair/reflection-check`, `penpair`, and anything added under `packages/` later. The root of the repository is a private workspace and is never published. The rule is enforced, not remembered:

| Guard | What it stops |
| --- | --- |
| `pnpm check` (and CI) runs `scripts/check-versions.mjs` | Any package at a different version, a version that differs from `packages/core/src/version.ts`, a private package, an internal dependency that is not `workspace:*`, a package without the publish guard |
| `pnpm version-packages` | One Changesets fixed group versions every package, synchronizes `version.ts` and refreshes the lockfile |
| `pnpm check:versions` | Missing, duplicate, ignored or separately grouped release packages, including packages added later |
| `prepublishOnly` in every package | `pnpm publish` inside one package: it refuses unless `pnpm release` started it, and checks the versions again |
| `pnpm release` | A half release: it checks, uploads the whole set with at most three workers, verifies registry visibility concurrently, and reports anything missing |

Publishing cannot be undone: a version, once published, cannot be replaced. Check first, publish once.

## Normal release: review a version PR

1. Add `pnpm changeset` to each package/script change, select an affected package
   and patch/minor/major, and describe the user-visible change. Commit the note
   with the feature. Documentation-only changes need no note; a script change
   with no release impact can use `pnpm changeset --empty`.
2. Merge the feature PR. Once enabled, `.github/workflows/version-pr.yml` creates
   or updates one **Release Penpair** PR from `changeset-release/main`.
3. Review the generated package changelogs and shared version. The highest bump
   requested across pending notes applies to **every** member of the fixed group,
   including unchanged packages. `pnpm version-packages` runs Changesets, updates
   the CLI source constant, refreshes the lockfile and checks consistency. It
   never publishes. Never run it on a feature branch. Feature-PR release-note
   checks use the exact PR base SHA, so detached CI checkouts need no local main
   branch. Version PRs instead verify the increased shared version and consumed
   notes through the dedicated release verifier.
4. Merge the version PR after CI passes. `.github/workflows/release.yml` checks
   the GitHub API for that exact merged, same-repository release PR and verifies
   a higher committed version with no pending notes. Ordinary main pushes skip
   publishing. The protected `npm-release` environment may require an additional
   owner approval, depending on its configured protection.
5. The existing `pnpm release` entrypoint reruns checks and all package smoke
   installs, uploads packed tarballs with at most three workers using npm OIDC and
   provenance, then verifies every required registry version concurrently (all six by default).
   It checks out the exact reviewed release SHA and verifies that it belongs to main's
   history. Feature PRs may merge while that immutable snapshot publishes; newer
   feature commits and their pending Changesets cannot alter the release artifacts.

Automation is opt-in through the activation switches below. Merging a feature PR
creates or updates the version PR; publishing starts only after that reviewed
version PR is merged and any environment approval is granted. Pending Changesets
determine the next shared version. Package versions remain unchanged on feature
branches until the separate version PR is generated and reviewed.

## One-time owner activation

- [ ] Review and merge the release implementation; do not enable automation on
  an unreviewed branch. Confirm GitHub's current action/runtime requirements.
- [ ] Protect `main`: require the CI job and owner approval, dismiss stale
  approvals, restrict bypasses, and disable automatic merging of release PRs.
  Prefer squash/merge commits; the automatic gate requires GitHub's recorded
  merge SHA to equal the exact main push (ambiguous rebase history fails closed).
- [ ] Add repository secret `CHANGESETS_PR_TOKEN`: a fine-grained GitHub token
  limited to this repository with Contents and Pull requests read/write, or a
  managed GitHub App token with the same rights. No npm permission is needed.
  Use a bot identity and restrict writes to `changeset-release/main` where your
  GitHub plan supports it. The token lets generated PR checks run automatically;
  do not give it branch-protection bypass. Never put it in repository files.
- [ ] Set `PENPAIR_RELEASE_AUTOMATION_ENABLED=true` to enable version PR creation.
  After this workflow is on main, open **Actions → Release version PR → Run
  workflow**, choose `main`, and run it to create the first version PR without
  another commit. The manual trigger still requires the activation variable and
  main branch. Inspect the generated PR and confirm its CI checks actually run.
- [ ] Create/protect environment `npm-release`, restrict deployments to main and
  configure required reviewers if retaining a second approval before publish.
- [ ] Configure the exact GitHub repository, `release.yml` workflow and
  `npm-release` environment as npm trusted publisher for **every** package.
  Node >=22.14.0/npm >=11.5.1 and supported hosted runners are required; the
  workflow uses Node 24 and checks npm before publishing.
- [ ] Verify publishing/bootstrap permissions for every package, especially the
  previously refused short name `penpair` and the new comparison adapter. A
  missing or blocked required package stops publishing. The owner-approved
  temporary `PENPAIR_RELEASE_EXCLUDE_PENPAIR=true` exception may omit only
  the short-name wrapper; every other package remains required.
- [ ] Set `PENPAIR_TRUSTED_RELEASE_ENABLED=true` only when all required packages
  are provisioned (five while the explicit short-name exception is enabled). Merge the reviewed version PR to release. Inspect registry versions
  and provenance for all packages afterward.

No npm token is needed for this path. The PR token authorizes GitHub changes;
short-lived OIDC authorizes npm publishing. The versioning job has no OIDC
permission; the publishing job has no repository write token. No workflow creates
or pushes tags or GitHub releases automatically.

## Temporary exception for the short name

While npm cannot accept `penpair`, set this **repository Actions variable**:

```text
PENPAIR_RELEASE_EXCLUDE_PENPAIR=true
```

This is the only configurable publishing exclusion. The same shared version and
Changesets fixed group still cover **all six** packages. Both automatic and manual
CI releases publish and verify the other five, skip registry access/publication
for `penpair`, and display the exception in logs and the GitHub step summary.
A successful run means all five required packages are verified; it does not claim
the full six-package family is published. Any other missing package still fails.
The exception is rejected if a required package starts depending on the wrapper.

The variable defaults to `false`/unset. Values other than `true`, `false` or empty
fail before release work. This variable does not enable automation or publishing.
Keep the two activation switches disabled until owner setup is complete. While
the exception is enabled, leave only `penpair`'s npm trusted publisher pending.
The `npm-release` environment does not need its own copy of this variable.

Once the name is available, configure its trusted publisher and set the repository
variable to `false` or remove it. For the latest reviewed version whose other five
packages already exist on npm, use manual dispatch with that exact version and
`continue_release=true`; the unchanged recovery guard publishes only the missing
wrapper. If nothing at the current version has been published, release normally.
The first run without the exception refuses a partial family unless continuation
is explicit. Historical skipped versions are not automatically backfilled.

Local owner-led releases can use the same environment variable. The older local
`--except penpair` option below still deliberately returns INCOMPLETE/exit 3; it
is separate from the configured CI exception, which succeeds once its five
required packages are independently verified.

## Local owner-led recovery

`pnpm bump patch|minor|major|x.y.z` remains a deliberate emergency tool, never
combined with Changesets versioning for the same release. Normal versions are
owned by the generated version PR. Do not hand-edit package versions. The root
workspace version is private and is excluded.

For a reviewed, committed, clean and pushed main release, local `npm login`/OTP
publishing remains available:

```bash
pnpm release                          # dry run; publishes nothing
pnpm release --publish --confirm-version X.Y.Z
```

Local OTP publication uploads one package at a time to keep interactive prompts
separate, then uses the same concurrent family visibility barrier.

The manual GitHub **Publish reviewed Penpair release** dispatch also remains:
enter the exact reviewed version. Optionally enter its full 40-character `release_sha`
when main has advanced; omitting it selects the dispatch commit. Both automatic
and manual releases require the selected SHA to match a merged, same-repository
release PR, contain the increased shared version, and have no pending Changesets
in that snapshot. Set `continue_release` only after inspecting an interrupted
release. The dispatch still passes through the protected environment and release guards.
Historical recovery requires the selected commit's `scripts/release-protocol.json`
to declare the controller's supported protocol (currently version 1). Missing or
unsupported protocols are rejected before checkout or publication approval; releases
predating this tooling must use their original recovery process. Incompatible future
publisher safeguards must increment both the marker and the supported protocol so
older publisher scripts cannot bypass them.

## If a release stops half way

After a successful upload, npm may still be processing the version. The release
does not block the remaining uploads on that package's registry visibility.
Up to three uploads run together. After all started uploads settle, every accepted
upload and already published required package is checked concurrently under one
shared ten-minute visibility deadline, with immediate checks followed by minute
polls. Each metadata query has a 30-second maximum (or the remaining deadline,
whichever is smaller), with npm's internal retries disabled. Query time counts
toward the deadline. Registry errors remain unknown failures rather than evidence
of absence. Visibility checks never republish. A failed upload stops new scheduling;
already started uploads finish and their results are retained before the command exits.
A partial release still requires explicit recovery.

A publish can fail after some packages are out (a network error, a wrong one-time code, a name npm refuses). The version is then on npm for some packages and not for others, which must not stay that way. Fix the cause and run:

```bash
pnpm release --publish --continue    # publishes only what is missing at this version
```

Without `--continue`, `pnpm release` refuses to run while only some packages are at the version, so a partial release cannot be forgotten.

For GitHub recovery, run **Publish reviewed Penpair release** on `main`, enter
the exact interrupted version, its full `release_sha` when main has advanced, and
set `continue_release=true`. Approve `npm-release` when requested. This checks
the registry again, skips versions already present and publishes only missing
required packages from that reviewed snapshot. If an accepted upload is still
propagating, wait and independently inspect the registry before requesting recovery.
A newer published `latest` version on any required package refuses the older
release rather than moving that tag backward. Tags are checked both during
preflight and immediately before uploads. Inspect final package/provenance
verification before counting the release complete.

Feature merges may continue during publication or recovery: pending Changesets
on newer main commits do not change the reviewed release snapshot. Keep release
versions in sequence and inspect a failed family before approving a newer release.
Only actual publish jobs enter the `penpair-package-release` concurrency group;
`queue: max` retains up to 100 pending jobs rather than replacing the previous one.
Queue arrival order can differ from version order, so the latest-version rollback
check remains required. See [GitHub concurrency documentation](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency).
Do not discard pending package-release notes or weaken guards to force recovery through.

For legacy releases predating snapshot-aware recovery, an empty, tooling-only Changeset contains no package release entries. Changesets
can consume that metadata without changing versions. If such a note blocks an
interrupted release, handle it in a reviewed metadata-only cleanup, preserve its
summary in the completion report and verify unchanged package/source versions
plus the existing manual gate. This does not apply to notes requesting a package
release. Retain the reviewed cleanup rationale and unchanged-version checks with
the release's own evidence; never relax the existing release guards.

## A package npm will not accept yet

`penpair` (the short name) is refused by npm while its name is blocked as too close to another package. To release the rest and keep the rule visible, leave it out explicitly:

```bash
pnpm release --publish --except penpair
```

The release is then reported as `INCOMPLETE` (exit code 3) on purpose. Recovery at that version requires explicit continuation and refuses if a newer required package version has already taken `latest`. Nothing else can be left out, and only by naming it.

## Verify

```bash
npm view @penpair/core version
npm view @penpair/web version
npm view @penpair/docker version
npm view @penpair/marwes-ui version
npm view @penpair/reflection-check version
```

Then, in an empty folder, run `npx @penpair/web --version`, `npx @penpair/web setup --help` and `npx @penpair/docker --version` (and, once the short name is published, the same with `npx penpair`). Tag the release if you want one: `git tag v<version> && git push origin v<version>`.

## What each package ships

The core ships `dist`, `skills`, `LICENSE` and a short `README.md`. The web package ships `dist`, `docs`, `LICENSE` and the repository's `README.md` (copied in by `prepack`, git-ignored there). The Docker package and the Marwes adapter ship `dist`, `LICENSE` and `README.md`. The short name ships `bin`, `LICENSE` and `README.md`. Check with `npm pack --dry-run --ignore-scripts` in a package.

## After publishing

Record registry versions, provenance and any explicit publishing exception in
the release evidence. Keep temporary release/recovery notes in `.working-docs/`
and lasting operational guidance in this document. A problem found in a published
version is answered with a new version of **all** packages, never by changing a
published one.

## Authentication and limits

See [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/) and
[provenance requirements](https://docs.npmjs.com/generating-provenance-statements/).
Publishing validates the workflow context and rejects long-lived npm token
fallback, packs with pnpm to rewrite `workspace:*` to exact versions, and publishes
single tarballs with npm and provenance. For SHA-selected recovery, only the npm
publish subprocess receives `GITHUB_SHA` set to the verified source SHA, so npm's
provenance source digest identifies the artifact checkout. Workflow identity/ref,
OIDC issuance and run invocation retain the actual dispatch context. These local checks are operational guards;
npm authenticates the actual identity against owner-managed publisher settings.

npm cannot atomically publish multiple packages. With concurrent uploads a dependent
package may briefly appear before its exact dependency has propagated. Consumers
should use a version after final family verification succeeds. A network/permission failure can
leave some published and others missing; the release reports failure and requires
explicit continuation at the same version. A rerun never silently resumes.

GitHub branch/environment protection and npm settings must be checked remotely
before activation. Tests use the real Changesets CLI in disposable workspaces and
fake GitHub/OIDC evidence; they do not establish account permissions or a live
publishing result. Owner activation, pushes, merges, version bumps and publishing
remain separate actions.
