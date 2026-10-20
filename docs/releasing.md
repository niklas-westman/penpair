# Releasing

All packages in this repository are released **together, at one version, even a package that did not change**: `@penpair/core`, `@penpair/web`, `@penpair/docker`, `@penpair/marwes-ui`, `penpair`, and anything added under `packages/` later. The root of the repository is a private workspace and is never published. The rule is enforced, not remembered:

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
pnpm release --publish       # the real thing; npm asks for your one-time code (or add --otp <code>)
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
