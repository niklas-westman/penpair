# @penpair/reflection-check Blueprint

## System Overview

`@penpair/reflection-check` is a penpair **adapter**: an optional package an
adopting project installs alongside one command package, at the same reviewed
version, and registers in the `adapters` list of `penpair.config.json`. It is the
companion for implementing a frontend from a Penpot design and then checking the
built result against the approved reference, repeatably.

It covers one span of a longer chain — *Penpot design → approved reference and
handoff → frontend code → browser capture → comparison → owner review* — and it
is deliberately narrow about which part. The adapter plans which approved
baselines are even eligible to be checked, then polices the evidence a project
provider hands back. It never drives a browser, never captures a screenshot,
never bundles a checker and never approves anything. A trusted project provider
owns activation, capture and pixel comparison with the project's own pinned
stack; the owner owns approval. Baselines remain owned by the core.

It depends on `@penpair/core` and plugs in through `defineAdapter`. The core loads
it by specifier and names it nowhere; the dependency runs one way only. It is
usable independently of `@penpair/marwes-ui`.

See [`README.md`](./README.md) for the user-facing guide, including the provider
contract and evidence format, and [`CHANGELOG.md`](./CHANGELOG.md) for release
history.

## Interface

The package publishes a single entry point, `./dist/index.js` with
`./dist/index.d.ts` types, built from `src/index.ts`:

- `default` — the `defineAdapter` result. It contributes **one** command
  (`reflection`) with subcommands `plan` and `check`. No `status()` line and no
  build kits.
- `planImplementationCases(config, results, mapping)` — admits only baselines
  whose approval provenance is exact and current, with an explicit setup name;
  everything else is returned as `pending` with a reason. One deliberate
  exclusion: a configured frame with no `route` is exported but never checked
  (`baselines-config.ts` says so), so it is out of scope rather than pending —
  unless the mapping names it, in which case the request cannot be honoured and
  it is reported as pending.
- `runImplementationCases(root, plan, provider)` — invokes the provider per case
  and validates the returned evidence, recording a per-case failure as incomplete
  rather than aborting.
- `runNativeReflectionCases(...)` — the native path: runs the cases against an
  engine the adopting project supplies, rather than a provider module this
  package loads.
- Types `ImplementationMapping`, `ImplementationCase`, `CasePlan`,
  `BrowserCaptureMetadata`, `ProviderEvidence`, `ImplementationProvider`,
  `ImplementationCaseReport`, `ImplementationReport`, and for the native path
  `NativeReflectionRequest`, `NativeReflectionOptions`,
  `ReleaseComparisonBinding`.

The CLI surface is:

```sh
penpair reflection plan  --map design/implementation-cases.json
penpair reflection check --map design/implementation-cases.json --provider design/reflection-provider.mjs
penpair reflection check --map FILE --engine-config FILE --engine-version VERSION [--release-context FILE]
```

`check` also accepts a `--json` flag that the command parses but does not use.

**Two execution models, and they differ in what they trust.** The `--provider`
form loads a project module in-process through `jiti`. The `--engine-config`
form resolves the project's pinned engine and runs it as a **child process**,
checking its version and capabilities first; with `--release-context` it refuses
to run unless the comparison identity matches the canonical finalized design
release. The project owns the browser stack in both cases; this package owns
admission and validation.

The provider module must export `async runCase(test)`. Full symbol-level detail,
including the validation internals that are not re-exported, is in the
[source contract](src/EGM.md).

## Subdirectories & System Boundaries

- **src**: [`./src/EGM.md`](./src/EGM.md) — the entire implementation, in a flat
  directory. The adapter entry, the command and its exit codes, case planning and
  provenance admission, provider loading, evidence validation, browser capture
  validation, and image reading and hashing.
- `test/` and `dist/` are outside this contract's scope: `test/` is test-only and
  `dist/` is build output. Neither is documented here.

## Global Invariants

- **One-way dependency.** This adapter depends on `@penpair/core`; the core never
  depends on it. `packages/core` must name neither this package nor any other
  project — a test fails the build if it does.
- **An adapter cannot do everything.** It may contribute CLI commands, an
  optional `status()` line and build kits. It may **not** register MCP tools or
  registry snippets, and it may not claim a reserved command name.
- **Evidence is never approval.** Every report carries `visualApproval: false`,
  `verdict: "owner-review-required"` and `accessibility: "not-assessed"`. A pixel
  ratio is checker evidence, never a visual verdict, an accessibility assessment
  or an owner sign-off. Exit `0` means complete evidence within thresholds, `2`
  measured drift, `3` missing or incomplete evidence — and all three still say
  owner review is required.
- **The provider interface is an evidence contract, not a sandbox.** A trusted
  provider can lie, and loading it executes project code with full process
  privileges. The adapter checks what it can check independently: observation
  hashes, font readiness, an independently resolved screenshot path, exact image
  dimensions, byte hashes, and that the baseline bytes are unchanged both before
  and after the provider runs.
- **No case is admitted loosely.** A planned case requires current exact approved
  provenance, a matching configured file pin, a non-legacy and non-forced
  approval, and an explicit setup name. No setup is ever silently replaced by a
  default route state; legacy cases stay on the existing generated Reflection
  path.
- **Persisted schemas stay stable.** The mapping, case plan, provider evidence,
  browser capture metadata and report all pin `schemaVersion: 1`; the baseline
  manifest must be `schemaVersion` 2 or 3. These are read from and written to
  adopting projects' trees.
- **No secrets in the repository, in output or in logs.** The MCP URL carries a
  personal key: never print or commit it.
- **Versions move together.** All packages in the repository release at one
  version, even one that did not change. Never bump a version by hand; normal
  releases go through Changesets and `pnpm version-packages`, `pnpm check` fails
  on drift, and `prepublishOnly` refuses a standalone publish. Publishing is the
  owner's act.

## Global Side Effects

- **The adopting project's working tree, read-only**: the baseline manifest at
  `<baselines.root>/penpair-baselines.json`, the `--map` file under a 1 MiB cap,
  and baseline and screenshot image bytes. This adapter writes no project files
  of its own.
- **Execution of project code, by two different routes.** On the `--provider`
  path the module and all of its transitive imports are loaded and run
  **in-process** through `jiti`. On the `--engine-config` path the project's
  pinned engine is spawned as a **child process** (`node:child_process` in
  `src/native-engine.ts`), so its failures and resource use are isolated from
  this one. A reader who knows only about the `jiti` route will mis-reason about
  the native path.
- **Uncontrolled delegated work**: `provider.runCase()`, or the native engine,
  may launch a browser, make network calls and write screenshot files. None of
  that is bounded by this package.
- **No Penpot traffic.** Unlike the Marwes adapter, this package never connects
  to a Penpot instance and never writes to a design file.
- **stdout**, carrying the report as pretty-printed JSON, plus a process exit code
  of 0, 2 or 3.

## System Verification

- Run: `pnpm test` (from `packages/reflection-check`)

Eight test files, covering the comparison contract, image and capture evidence,
the offline integration path, release binding, the native bridge and browser,
and threshold policy. One is skipped by default. The adapter's offline
integration test uses a named stub, and the shipped browser starter has only been
exercised against local fixture routes — neither establishes parity for a
consumer's own provider or engine. Counts of passing tests are not restated
here; run the suite.

`pnpm check` is the repository's full gate — style and path checks, build,
typecheck, convention examples, tests and the version check — but its first step
shells out to `git ls-files`, so it cannot run in a tree without a `.git`
directory. `pnpm smoke:package` packs all six packages and must run before any
release.
