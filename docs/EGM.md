# docs

## Overview

The maintained documentation tree. Almost all of it is prose for humans and
agents — installation routes, the design workflow, the MCP tool inventory, layout
settling, staged runs, queues, releasing, recovery, compatibility — and only one
subtree holds code.

That exception is what makes this directory a boundary rather than a folder:
`conventions/templates` holds **executable** convention examples. They are
typechecked and run by the test suite, so they are contracts that cannot drift
from the core API they import, not illustrations that can.

Two files here are generated rather than written, both asserted byte-for-byte by
`packages/core/test/docs.test.ts`, so edit the source rather than the page:
`troubleshooting.md` is produced from the core's error remedies by
`scripts/generate-troubleshooting.mjs`, and `skills.md` is produced from the
bundled skill set by `scripts/generate-skill-index.mjs`. `skills.md` is the only
maintained list of which skills exist; other pages link to it rather than
repeating the set, so a renamed skill cannot leave a stale list behind.

`docs/designs/` holds design records and `docs/assets/` holds images; neither
contains source, so neither carries a contract file.

This tree ships inside **both command packages**. Each one's `prepack` runs
`scripts/copy-package-docs.mjs <target>` and each `files` array includes `docs`
and `examples`, so a page added here reaches users of the web command and users
of the Docker one alike.

Three things are deliberately excluded from that copy: `assets` (the README
links its images by URL), `.working-docs` (private), and **`designs`** — design
records are contributor history, not documentation for someone installing the
command. The filter lives in `scripts/copy-package-docs.mjs`.

The same script will not replace a package's own README. `@penpair/docker`
maintains one and keeps it; `@penpair/web` maintains none and receives the
project README at pack time. That rule lives in `copy-package-docs.mjs`, is
asserted by `package-docs.test.ts` and checked by `smoke-package.mjs`;
`scripts/guard-publish.mjs` enforces only `PENPAIR_RELEASE=1` and version
consistency.

## Subdirectories & Boundaries

- **conventions**: [./conventions/EGM.md](./conventions/EGM.md) — the code
  conventions plus the executable examples that keep them honest. Division of
  labour is explicit: `biome.json` owns formatting, `check-code-paths.mjs` owns
  directory naming, and review owns whether a name describes intent.
- **designs**: design records — why a change was made and what was decided
  against. [designs/README.md](./designs/README.md) indexes them with a status
  each, because two of the five record work that was superseded and reading one
  without its status will mislead. Markdown only, no contract file, and excluded
  from the published packages.
- **assets**: images referenced by the published documentation. No contract file.

## Global Invariants

- The convention examples must compile and run. They are reached by
  `pnpm conventions:check`, **not** by `pnpm test`: `pnpm-workspace.yaml` lists only
  `packages/*` and `docs/conventions` has no `package.json`, so the recursive test
  run never descends here.
- `troubleshooting.md` is generated and byte-compared. Change
  `packages/core/src/errors.ts` and regenerate; editing the page directly fails
  the test.
- `skills.md` is generated and byte-compared. It follows the bundled skills'
  own `name`/`description` metadata, so add, rename or redescribe a skill in
  `packages/core/skills/` and run `pnpm docs:generate`; editing the page
  directly fails the test.
- Published documentation never links into `.working-docs/`. That directory is
  git-ignored, holds internal reports and private evidence, and a link into it
  fails the documentation test.
- Every local link and Markdown anchor in this tree must resolve.
  `packages/core/test/docs.test.ts` walks `docs/**` plus `README.md`, `AGENTS.md`,
  `CONTRIBUTING.md` and `SECURITY.md` and checks each target and fragment.
- A documented command, flag or limit must match the code. Several pages carry
  exact figures — the 90 KB snippet ceiling, the 10,000 ms settle default against
  a 30,000 ms refusal ceiling, the kit byte budgets — and a stale figure here is a
  defect, not a cosmetic issue.
- Anything added to this tree ships inside both command packages, `@penpair/web` and `@penpair/docker`.

## Global Side Effects

- `pnpm conventions:check` typechecks with `noEmit` and runs Vitest once; it
  writes nothing.
- `pnpm docs:generate` builds the core and rewrites `docs/troubleshooting.md` and `docs/skills.md`.
- `scripts/copy-package-docs.mjs` recursively removes and re-copies
  `packages/<target>/docs` at pack time.
- `docs/conventions` is one of the code roots scanned by
  `scripts/check-code-paths.mjs` for kebab-case paths.

## System Verification

- `pnpm conventions:check` — `tsc -p docs/conventions/tsconfig.json` followed by
  `vitest run --config docs/conventions/vitest.config.ts`.
- `pnpm test` in `packages/core` — covers `docs.test.ts` for link and anchor
  resolution and the generated troubleshooting page.
