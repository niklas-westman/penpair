# Code conventions

## Overview

The repository's code conventions, and the executable examples that keep them
honest. The guides here are routing documents: start from the row matching your
change, copy the pattern, then rename to the nearest production module's domain
vocabulary. What makes this directory a code boundary rather than prose is
[`templates/`](./templates/EGM.md) — those examples are **compiled and executed by
the test suite**, so a convention that stops matching the core API fails a check
instead of quietly rotting.

The division of labour is explicit and worth preserving: `biome.json` owns
formatting, `check-code-paths.mjs` owns directory naming, and human or agent review
still owns whether a name describes intent and whether a responsibility should be
split. A formatter cannot judge those.

Human-maintained guides live in [`README.md`](./README.md),
[`structure.md`](./structure.md), [`typescript.md`](./typescript.md) and
[`plugin-code.md`](./plugin-code.md). This contract does not replace them.

## Subdirectories & Boundaries

- **templates**: [`./templates/EGM.md`](./templates/EGM.md) — the three executable
  convention examples. `formatFrameLabel` / `FrameLabel` (helper and contract shape),
  `createFrameInspection` (a read-mode Penpot sandbox snippet), and
  `exampleStatusCommand` (an adapter command returning exit codes).
  `conventions.test.ts` imports and runs all three, and also exercises
  `findInvalidCodeDirectories` from
  [`scripts/check-code-paths.mjs`](../../scripts/EGM.md).
- `node_modules/`: a Vitest cache directory, not installed dependencies. There is
  no `package.json` here; Vitest and TypeScript resolve from the repository root.

## Local Interface & Invariants

Direct files in this directory:

| File | Role |
| --- | --- |
| `vitest.config.ts` | Roots Vitest at this directory and includes only `templates/**/*.test.ts`. |
| `tsconfig.json` | Extends the repository `tsconfig.json` with `noEmit`, `allowJs` and `checkJs`; includes `templates/**/*.ts` and `vitest.config.ts`. |
| `README.md`, `structure.md`, `typescript.md`, `plugin-code.md` | The maintained guides. |

Invariants:

- **The examples must compile and run.** `pnpm conventions:check` typechecks them and
  executes `conventions.test.ts`. They are contracts, not illustrations.
- **Production code never imports these templates.** They are copied and renamed.
- **This is not a workspace package.** `pnpm-workspace.yaml` lists only `packages/*`,
  so `pnpm test` (`pnpm -r test`) does not reach here. `pnpm conventions:check` is the
  command that runs this directory.
- **`biome.json` is the formatting authority**: two spaces, LF, a 100-column target,
  double quotes, semicolons, expanded object and array layouts, parenthesized arrow
  parameters, braces required, one variable per declaration.
- **Vertical spacing stays an author and review responsibility.** Biome preserves
  intentional blank lines but will not add separation between declarations or logical
  steps; follow `typescript.md` even when `check:style` passes.
- **Kebab-case code paths** under `packages/`, `scripts/`, `examples/`, `skills/` and this
  folder, including new untracked files.
- **Raw plugin bodies are deliberately outside formatting.** `examples/hello-card/`,
  `examples/theme-preview/` and `examples/trials/` may contain a top-level `return`,
  which Biome's module parser rejects; their sandbox tests compile them as async
  function bodies. Follow `plugin-code.md` when editing them.
- **JavaScript inside a template string is string data.** Format it deliberately and
  test the generated snippet. **Never run blind whitespace rewriting over strings,
  serialized snapshots, captured evidence or embedded protocols.**
- **Generated `dist/`, dependencies, ignored local artifacts and data fixtures are
  outside formatting.** Keep captured evidence unchanged.
- **Internal reports, trial evidence and upstream drafts belong in git-ignored
  `.working-docs/`.** Maintained guides must work without those files, and public
  documentation must never link into them.
- **Add a new file-type example only when a real feature needs the pattern.** Keep it
  minimal and executable; do not introduce a framework or dependency for a template.
- The repository skill
  [`penpair-code-conventions`](../../.agents/skills/penpair-code-conventions/SKILL.md)
  applies this workflow to implementation work. It develops Penpair itself; the
  separately shipped `packages/core/skills/` teach consumers how to use Penpair.

## Global Side Effects

- **No runtime side effects.** The templates are pure; the test executes a generated
  sandbox body against an in-memory stub `penpot`, not a real Penpot file.
- `pnpm conventions:check` writes nothing: `tsc` runs with `noEmit` and Vitest runs
  once without watching.
- This directory is one of the code roots that `scripts/check-code-paths.mjs` scans.
- `scripts/copy-package-docs.mjs` copies the whole of `docs/` into the package
  named on its command line, excluding `assets`, **`designs`**, `node_modules`
  and `.working-docs`. **Both command packages invoke it** — `@penpair/web` and
  `@penpair/docker` — so changes here ship in both tarballs. `docs/designs/` is
  deliberately held back: design records are contributor history, not
  documentation for someone installing the command.

## System Verification

- Run from the repository root: `pnpm conventions:check`, which is
  `tsc -p docs/conventions/tsconfig.json && vitest run --config docs/conventions/vitest.config.ts`.
- `pnpm check:style` (`biome check . && node scripts/check-code-paths.mjs`) covers
  formatting, the focused lint rules and code directory names. Its second step needs a
  git checkout or worktree.
- The repository's full gate is `pnpm check`. It needs a git checkout or worktree,
  because `scripts/check-code-paths.mjs` shells out to `git ls-files`. In a source copy
  without `.git`, run the stages individually and report the validation as partial.
