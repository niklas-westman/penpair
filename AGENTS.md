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
- Keep reusable design investigations and proposals in `docs/designs/`, linked
  from the documentation index, with status and the version or commit examined.
  Session handoffs, review reports and private evidence stay in `.working-docs/`.
- Push, tag, publish, version bumps, deploys and any write to a Penpot instance other than a scratch one need the owner's go-ahead. Local commits of verified steps do not, once the owner has asked for commits.

## Product design releases

For Penpot product release pages, adoption, retained frames, readiness, approval
or interrupted release work, read
[penpair-design-release](packages/core/skills/penpair-design-release/SKILL.md)
first. Use the installed CLI's release status and evidence to identify the current
step, blockers and next valid action; report design readiness separately from
implementation acceptance. Preserve owner approval and Penpot write boundaries.
All design-release work (plan, adopt, assemble, verify, finalize, status) goes
through that skill and the `design-release` command, which write the release
records, pointers and approval records; hand edits and ad-hoc scripts do not.
Publishing Penpair's npm packages follows [the package release guide](docs/releasing.md)
instead; the product design-release skill does not authorize publication.

## Skills

Two sets, kept apart:

- **Shipped skills** are in `packages/core/skills/` and serve the people who use
  Penpair. `penpair skills install` copies them into an adopting project and
  writes a routing table into that project's `AGENTS.md` or `CLAUDE.md`, generated
  from `packages/core/src/skill-routing.ts`. They are product: a new or renamed
  skill needs its routing row, passing skill tests
  ([docs/skill-validation.md](docs/skill-validation.md)) and a changeset.
- **Repository skills** are in `.agents/skills/` and serve work on Penpair itself
  (`penpair-code-conventions`). They are never shipped.

## Penpot layout

Everything Penpair builds or generates in Penpot is auto layout: flex boards that
size to their content, `auto` to hug and `fill` to stretch, with one gap between
siblings. This covers renderer and snippet code as well as built screens. Only
connectors and art that bleeds off an edge are absolutely positioned, each with a
comment saying why. Read
[auto-layout](packages/core/skills/penpair-design/references/auto-layout.md)
before writing code that creates Penpot shapes, and check the export with a
deliberately long title.

## Code conventions

Before creating or refactoring code, read [docs/conventions](docs/conventions/README.md)
and the relevant file-type example. Use the repository skill
[penpair-code-conventions](.agents/skills/penpair-code-conventions/SKILL.md) for this work.
Use kebab-case code paths, descriptive local names and focused responsibilities;
extract independently meaningful validation, I/O and command logic as it appears.
Keep public imports and persisted schemas stable when moving code.

Re-read cited files and symbols before reasoning from a `file:line` reference,
including references copied from earlier notes or reviews. Line numbers can drift.
Kit JavaScript inside `String.raw` is string data: symbol searches may land inside
strings, and Biome does not format their contents.

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
- Measure kit byte limits against the generated source consumers load. Code
  serialized with `Function.toString()` can differ between build/test transforms;
  run adapter tests as well as core tests before changing sandbox generation.
  After editing `layout-settling.ts`, run `pnpm sandbox:generate`; core builds
  check the tracked artifact without rewriting it.
- Pin the Penpot version; run the smoke test before bumping it.

## Packages

`@penpair/core` (`packages/core`: the library and engine with the skills; no command), `@penpair/web` (`packages/web`: the `penpair` command for Penpot on the web), `@penpair/docker` (`packages/docker`: the same command plus Penpot in Docker) and `penpair` (`packages/penpair`: the short name for `@penpair/web`). Same version, always. The dependency only goes one way: the command packages depend on the core, which offers a plug-in point (`runCli`, `LocalProfile` in `local-profile.ts`) and knows nothing about what plugs in. The core has no command, so the two command packages never fight over the name `penpair`; a user installs one of them. Tests enforce all of this. Adapters (`@penpair/marwes-ui`, `@penpair/reflection-check`) are further packages that depend on the core and plug in through `defineAdapter`: the core loads them from the project's `adapters` list and names none of them. Publishing is the owner's act; the steps are in `docs/releasing.md`. **All packages are released together, at one version, even a package that did not change.** Never bump a version by hand: normal releases use Changesets and `pnpm version-packages` on the generated release PR to update every package, `version.ts` and the lockfile together; `pnpm bump` remains an owner-led emergency tool; `pnpm check` fails on any drift; every package refuses `pnpm publish` on its own (`prepublishOnly`); `pnpm release` is the only way to publish. The owner-approved temporary publishing exception `PENPAIR_RELEASE_EXCLUDE_PENPAIR=true` may omit only the `penpair` wrapper from npm publication; all six repository versions still move together, every other package is required, and the omission must be reported. Never edit a guard to get a release through.

## Validation

`pnpm check` runs style/path checks, the build, typechecking, executable convention examples, tests and the version check. `pnpm smoke:package` packs all six packages, installs them in an empty project and runs them; run it before any release.

`pnpm check` requires a Git checkout or worktree: the code-path check uses
`git ls-files`. In a source copy without Git metadata, run `pnpm exec biome check .`,
`pnpm build`, `pnpm typecheck`, `pnpm conventions:check`, `pnpm test` and
`pnpm check:versions` in that order. Report these as partial validation;
Git-dependent checks and the full gate remain unverified until `pnpm check`
passes in a checkout or worktree.
