# Examples

## Overview

Runnable starting points for adopting projects, not a demo gallery. Each
code-bearing subdirectory is either a worked instance of the repository's **write
protocol** — a read-only inspect script, one idempotent write, and an independent
readback — expressed as raw Penpot plugin-sandbox bodies, or a browser-side
measurement starter meant to be copied into the adopting project.

Two things set this tree apart from the rest of the repository. First, the sandbox
bodies are not Node modules: they are function bodies evaluated inside the Penpot
plugin sandbox with `penpot`, `CFG` and a top-level `return` in scope, which is why
`biome.json` deliberately excludes `examples/hello-card/**`,
`examples/theme-preview/**` and `examples/trials/**` from formatting. Second, the
examples carry the project's honest limitations in writing — a projected fill
removes a token binding, a synthetic fixture is not design acceptance — because
those limits are the part most easily lost in a retelling.

This directory holds no direct source of its own.

## Subdirectories & Boundaries

- **hello-card**: [`./hello-card/EGM.md`](./hello-card/EGM.md) — the reference write
  protocol. Four sandbox bodies that build one marker-owned board bound to existing
  active tokens, refusing ambiguity and preserving IDs on repeat.
- **theme-preview**: [`./theme-preview/EGM.md`](./theme-preview/EGM.md) — projects one
  resolved theme color onto an owned scratch root and records its provenance. Setting
  the fill directly **removes any fill binding**; it is never native theme binding.
- **trials**: [`./trials/EGM.md`](./trials/EGM.md) — deliberate failure paths: a
  contended write window, a fault *after* a successful owned write, and a wrong-file read the
  guard must block.
- **component-pilot**: [`./component-pilot/EGM.md`](./component-pilot/EGM.md) —
  `measure(cases)`, a Playwright renderer that reads the computed anatomy of the
  adopting project's real components. Backs the `component-pilot` kind in
  `@penpair/marwes-ui`.
- **reflection-browser**: [`./reflection-browser/EGM.md`](./reflection-browser/EGM.md) —
  an `ImplementationProvider.runCase` starter: real browser capture compared to an
  approved baseline by exact decoded RGBA pixels, with no resize and no threshold.
- **design-release-maps**: Markdown and JSON only (`README.md`, `integration.json`,
  `journey.json`, `sample-source.md`) — sample design-to-release maps. No source
  code, so no contract file.
- `coverage-matrix.json`: a sample baseline coverage matrix mapping named Penpot
  frames to implementation cases (viewport, theme, state, fixture, pinned fonts).
  Placeholder values such as `"Your pinned font family and weight"` are meant to be
  replaced.
- `reflection-browser/fixture/`: synthetic test fixture data for the local plumbing
  smoke test. **Deliberately unapproved** — not evidence, not a baseline.

## Local Interface & Invariants

No direct source files. The shared conventions across every child:

- **The write protocol is not optional.** Inspect read-only, pin a snapshot, perform
  one idempotent write, read back independently, then export and *look at it*. A
  first export after a write or a page switch can be stale — look twice.
- **Every sandbox body declares its role in its leading comments**: the first line
  is `// penpair: read` or `// penpair: write`, and a write body also carries
  `// penpair: idempotent` in the comment block before the first line of code.
  `packages/core/src/run-file.ts` reads the first line for the role and looks for
  the idempotent line among the leading comments. The pragma is load-bearing.
- **The pinned snapshot is re-checked at write time.** A source that changed between
  inspect and apply refuses the write; it is never reconciled silently.
- **Ambiguity refuses rather than guesses.** A duplicate name, a moved or duplicated
  ownership marker, or an object owned by someone else is an error, never a thing to
  repair or delete.
- **Readback is independent.** It re-derives the observed state from the file or the
  DOM; it never echoes the write's own return value.
- **Ownership markers are bookkeeping, not authorization.** Every write target must be
  an owner-authorized, disposable scratch file. An existing design root is never
  adopted implicitly.
- **Evidence is not approval.** A passing smoke run or a numeric pixel ratio is
  plumbing evidence; owner review stands.
- **Snippets sent to Penpot stay under 90 KB** (the proxy refuses about 110 KB).
- Project knowledge belongs here or in adapters — never in the neutral
  `packages/core`.
- No secrets in these files, in output, or in logs.

## Global Side Effects

- The sandbox write bodies **mutate Penpot design files** (boards, fills, shared
  plugin data under the `penpair` namespace) and must only ever be aimed at an
  authorized scratch file.
- `component-pilot/renderer.mjs` **launches a real browser** (its own Playwright
  Chromium) and writes nothing. `reflection-browser/provider.mjs` receives a
  caller-supplied `browser`, and writes image evidence to
  `.penpair/reflection/<sha>.<fmt>`. Both make loopback network requests.
- `reflection-browser/serve.mjs` **binds a TCP port** on `127.0.0.1`
  (`PENPAIR_EXAMPLE_PORT`, default `4174`).
- `scripts/copy-package-docs.mjs` copies this whole tree into the package named
  on its command line. **Both command packages now invoke it** — `@penpair/web`
  and `@penpair/docker` — so anything added here ships in both tarballs. The
  copy recursively force-removes that package's `docs/` and `examples/` first,
  and excludes `node_modules`, `artifacts`, `.penpair` and `.working-docs`.

## System Verification

- `pnpm test` from the repository root (`pnpm -r test`) runs the sandbox-body tests in
  `@penpair/core` that compile the `hello-card`, `theme-preview` and `trials` bodies —
  `packages/core/test/kit-integration.test.ts`,
  `packages/core/test/theme-preview-example.test.ts` and
  `packages/core/test/trial-examples.test.ts`.
- `pnpm smoke:browser` exercises `reflection-browser` plumbing; it needs a locally
  installed pinned Playwright and browser.
- `component-pilot` has no automated coverage in this repository — nothing here
  executes it. It is verified in the adopting project against that project's fixture.
- **Never run these example scripts to "check" them.** The write bodies change design
  files. Compile them; do not execute them.
- The repository's full gate is `pnpm check`. It needs a git checkout or worktree,
  because `scripts/check-code-paths.mjs` shells out to `git ls-files`. In a source copy
  without `.git`, run the stages individually and report the validation as partial.
