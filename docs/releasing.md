# Releasing

All packages in this repository are released **together, at one version, even a package that did not change**: `@penpair/core`, `@penpair/web`, `@penpair/docker`, `@penpair/marwes-ui`, `@penpair/reflection-check`, `penpair`, and anything added under `packages/` later. The root of the repository is a private workspace and is never published. The rule is enforced, not remembered:

| Guard | What it stops |
| --- | --- |
| `pnpm check` (and CI) runs `scripts/check-versions.mjs` | Any package at a different version, a version that differs from `packages/core/src/version.ts`, a private package, an internal dependency that is not `workspace:*`, a package without the publish guard |
| `pnpm bump patch\|minor\|major\|x.y.z` | Drift starting at all: it sets every package and `version.ts` in one step |
| `prepublishOnly` in every package | `pnpm publish` inside one package: it refuses unless `pnpm release` started it, and checks the versions again |
| `pnpm release` | A half release: it checks, publishes the whole set in dependency order, looks each one up on npm, and reports anything missing |

Publishing cannot be undone: a version, once published, cannot be replaced. Check first, publish once.

## One time

1. The npm organisation `penpair` exists (npmjs.com, Add organization, free for public packages).
2. `npm whoami` prints your user name. If it answers `401`, run `npm login`.

## Each release

```bash
pnpm bump patch              # or minor, major, or an exact x.y.z: every package and version.ts move together
# add a section to CHANGELOG.md
pnpm check                   # typecheck, tests, build and the version check
git commit -am "Release 0.1.3" && git push

pnpm release                 # dry run: checks everything, prints the plan, publishes nothing
pnpm release --publish       # the real thing; requires exact version confirmation, then npm authentication/OTP (or add --otp <code>)
```

`pnpm release` refuses unless all of this is true, and tells you which part is not:

- every package has the same version, and the source version matches;
- you are on `main`, the working tree is clean, and `main` equals `origin/main`, so what is published is what is on GitHub;
- npm has none of the packages at this version (or it is an interrupted release, below);
- `pnpm check` and `pnpm smoke:package` pass (the smoke test packs every package, installs the tarballs in empty projects and runs them).

Then it publishes in dependency order (the core, then the packages that depend on it), waits until npm shows each one, and finally looks up all of them. If any is missing it says `INCOMPLETE` and exits with 3.

## If a release stops half way

A publish can fail after some packages are out (a network error, a wrong one-time code, a name npm refuses). The version is then on npm for some packages and not for others, which must not stay that way. Fix the cause and run:

```bash
pnpm release --publish --continue    # publishes only what is missing at this version
```

Without `--continue`, `pnpm release` refuses to run while only some packages are at the version, so a partial release cannot be forgotten.

## A package npm will not accept yet

`penpair` (the short name) is refused by npm while its name is blocked as too close to another package. To release the rest and keep the rule visible, leave it out explicitly:

```bash
pnpm release --publish --except penpair
```

The release is then reported as `INCOMPLETE` (exit code 3) on purpose, and `pnpm release --publish --continue` finishes it the day npm allows the name. Nothing else can be left out, and only by naming it.

## Verify

```bash
npm view @penpair/core version
npm view @penpair/web version
npm view @penpair/docker version
npm view @penpair/marwes-ui version
```

Then, in an empty folder, run `npx @penpair/web --version`, `npx @penpair/web setup --help` and `npx @penpair/docker --version` (and, once the short name is published, the same with `npx penpair`). Tag the release if you want one: `git tag v<version> && git push origin v<version>`.

## What each package ships

The core ships `dist`, `skills`, `LICENSE` and a short `README.md`. The web package ships `dist`, `docs`, `LICENSE` and the repository's `README.md` (copied in by `prepack`, git-ignored there). The Docker package and the Marwes adapter ship `dist`, `LICENSE` and `README.md`. The short name ships `bin`, `LICENSE` and `README.md`. Check with `npm pack --dry-run --ignore-scripts` in a package.

## After publishing

Update the version in `PLAN.md` and add the change log line. A problem found in a published version is answered with a new version of **all** packages, never by changing a published one.

## Owner-gated trusted publishing

The branch prepares a manual GitHub workflow in `.github/workflows/release.yml`. It stays disabled unless the owner sets repository variable `PENPAIR_TRUSTED_RELEASE_ENABLED=true`. The owner must first configure `npm-release` as a protected environment with required reviewers and main-only deployment rules, and configure the exact repository/workflow/environment as trusted publisher for **each package**, including new packages and the short name. No remote setting or release was changed here.

The entrypoint keeps the existing main/clean/pushed, lockstep version, internal dependency, package prepublish guard, registry-state and publish-order checks. Actual publishing additionally requires typing the exact checked version, or explicit `--confirm-version X.Y.Z` for noninteractive runs. The workflow supplies that reviewed version; it never bumps, tags or pushes. Interrupted releases still require explicit continuation and whole-family registry verification. The local authenticated/OTP recovery path remains available.

Trusted mode validates manual-main GitHub/OIDC context and runtime minimums, refuses long-lived token environment fallback, runs each unchanged package guard, packs with pnpm to rewrite `workspace:*` into exact versions, then publishes that single tarball with npm and provenance. Tarball hashes are reported. These local checks are operational guards; npm authenticates the real workload identity against owner-managed settings. Environment protection must be verified in GitHub, not inferred from a YAML name.

According to [npm trusted publishing documentation](https://docs.npmjs.com/trusted-publishers/), use supported hosted runners, Node >=22.14.0/npm >=11.5.1, exact workflow settings and appropriate direct-publish permission. Provenance requires supported public source/package conditions; confirm [provenance requirements](https://docs.npmjs.com/generating-provenance-statements/). A package or publisher configuration that cannot be provisioned must stop the release, not bypass a guard. New/blocked names may need owner-led bootstrap or support resolution before the full family is releasable.

Before activation, review current runtime/actions and advisory status, verify every npm publisher permission and repository URL, and inspect the intended tarballs. After a separately authorized release, verify registry versions and provenance for all packages. Offline tests here use fake commands; they do not prove npm/GitHub account policy or an actual OIDC exchange. Owner activation, publishing, version bumps, tags and pushes remain pending.
