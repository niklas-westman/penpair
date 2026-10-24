# Agent instructions

## Working documents

Read this file and the maintained guides relevant to the task. Keep internal
plans, execution checklists, session reports and private evidence in
`.working-docs/`, which is git-ignored and is not part of published packages.
Existing local work is tracked in `.working-docs/PLAN.md` when present; a fresh
clone must not depend on that file. Promote durable behavior and limitations into
the maintained documentation before archiving working notes.

- For an active local plan, check a box only when the step is built and verified,
  and add a completion note. Keep one "Now" item and record new work unchecked.
- Never force-add `.working-docs/` or link public documentation to local-only
  notes. Keep reusable guides, conventions, skills and examples tracked.
- Push, tag, publish, version bumps, deploys and any write to a Penpot instance other than a scratch one need the owner's go-ahead. Local commits of verified steps do not, once the owner has asked for commits.

## Code conventions

Before creating or refactoring code, read [docs/conventions](docs/conventions/README.md)
and the relevant file-type example. Use the repository skill
[penpair-code-conventions](.agents/skills/penpair-code-conventions/SKILL.md) for this work.
Use kebab-case code paths, descriptive local names and focused responsibilities;
extract independently meaningful validation, I/O and command logic as it appears.
Keep public imports and persisted schemas stable when moving code.

`biome.json` owns formatting. Run `pnpm format` after edits, then `pnpm check`.
The checks enforce supported-source formatting, braces, separate declarations,
code path naming and executable convention examples. Review still checks naming
quality and module boundaries; generated evidence and sandbox strings need the
specific handling described in the conventions.

## Rules that do not bend

- **Neutral core.** `packages/core` never names a project or a component library. A test fails the build if it does. Project knowledge goes in adapters, in the adopting project, or in the examples.
- **No secrets in the repository, in output or in logs.** The MCP URL carries a personal key: redact it, never print it, never commit it.
- **Write protocol for any Penpot change:** read-only inspect, a pinned snapshot, one idempotent write, an independent readback, an export that is looked at. A first export after a write or a page switch can be stale; look twice.
- **Snippets sent to Penpot stay under 90 KB** (the proxy refuses about 110 KB).
- Pin the Penpot version; run the smoke test before bumping it.

## Packages

`@penpair/core` (`packages/core`: the library and engine with the skills; no command), `@penpair/web` (`packages/web`: the `penpair` command for Penpot on the web), `@penpair/docker` (`packages/docker`: the same command plus Penpot in Docker) and `penpair` (`packages/penpair`: the short name for `@penpair/web`). Same version, always. The dependency only goes one way: the command packages depend on the core, which offers a plug-in point (`runCli`, `LocalProfile` in `local-profile.ts`) and knows nothing about what plugs in. The core has no command, so the two command packages never fight over the name `penpair`; a user installs one of them. Tests enforce all of this. Adapters (`@penpair/marwes-ui`, `@penpair/reflection-check`) are further packages that depend on the core and plug in through `defineAdapter`: the core loads them from the project's `adapters` list and names none of them. Publishing is the owner's act; the steps are in `docs/releasing.md`. **All packages are released together, at one version, even a package that did not change.** Never bump a version by hand: normal releases use Changesets and `pnpm version-packages` on the generated release PR to update every package, `version.ts` and the lockfile together; `pnpm bump` remains an owner-led emergency tool; `pnpm check` fails on any drift; every package refuses `pnpm publish` on its own (`prepublishOnly`); `pnpm release` is the only way to publish. The owner-approved temporary publishing exception `PENPAIR_RELEASE_EXCLUDE_PENPAIR=true` may omit only the `penpair` wrapper from npm publication; all six repository versions still move together, every other package is required, and the omission must be reported. Never edit a guard to get a release through.

## Validation

`pnpm check` runs style/path checks, the build, typechecking, executable convention examples, tests and the version check. `pnpm smoke:package` packs all six packages, installs them in an empty project and runs them; run it before any release.
