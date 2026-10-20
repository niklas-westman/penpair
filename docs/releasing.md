# Releasing

Two packages are published from this repository, always with the same version: `@penpair/core` (the library, the command, the skills; `packages/core`) and `penpair` (the short name for the command; `packages/penpair`). The root of the repository is a private workspace and is never published.

Publishing cannot be undone: a version, once published, cannot be replaced. Check first, publish once.

## One time

1. An npm organisation named `penpair` must exist (npmjs.com, Add organization, free for public packages). `@penpair/core` cannot be published without it.
2. `npm whoami` must print your user name. If it answers `401`, run `npm login`.
3. If npm asks for a one-time code, add `--otp=<code>` to each publish.

## Before publishing

1. Be on `main` with everything committed and pushed, and the version raised in both `packages/core/package.json` and `packages/penpair/package.json` (and `version` in `packages/core/src/index.ts`; a test fails if they differ). A change that existing users could not ignore is major, an additive change is minor, a fix is a patch. Add a section to `CHANGELOG.md`.
2. Run every check:

   ```bash
   pnpm check            # typecheck, tests, build
   pnpm smoke:package    # packs both packages, installs them in an empty project, runs the command and the library
   ```

3. Check what would be published: `npm pack --dry-run --ignore-scripts` in each package. The core ships `dist`, `skills`, `docs`, `LICENSE` and `README.md`; the wrapper ships `bin`, `LICENSE` and `README.md`. Nothing else. (`prepack` copies the root README and `docs/` into the core for the tarball; the copies are git-ignored.)

## Publish

The core first, because the wrapper depends on it at this exact version. Use `pnpm publish` so `workspace:*` is replaced by the real version.

```bash
cd packages/core && pnpm publish --access public
cd ../penpair && pnpm publish --access public
```

## Verify

```bash
npm view @penpair/core version
npm view penpair version
```

Then, in an empty folder, run `npx penpair --version` and `npx penpair setup --help`, so what was tested is what people get. Tag the release (`git tag v<version>`) and push the tag only if you want one.

## After publishing

Update the version in `PLAN.md` and add the change log line. A problem found in a published version is answered with a new patch or minor version, never by changing a published one.
