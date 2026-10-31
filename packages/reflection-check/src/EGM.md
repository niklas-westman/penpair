# reflection-check source

## Overview

The implementation of `@penpair/reflection-check`, a penpair adapter that turns an
approved Penpot design reference into an explicit, checkable implementation case
and then collects a project provider's evidence that the built frontend matches
it.

The directory holds two halves with a deliberate seam between them. `case-plan.ts`
decides *which* baselines are eligible to be checked at all, admitting a case only
when its approved provenance is exact and current. `run-cases.ts`,
`evidence-validation.ts` and `capture-validation.ts` then police the evidence a
provider hands back. The package never captures a screenshot, never drives a
browser and never approves anything: a trusted project provider owns activation,
capture and pixel comparison, and the owner owns approval. What lives here is the
contract that evidence must satisfy before it is allowed to count.

There are two execution paths for `check`. The **provider path** loads a
project-supplied module exporting `runCase` (via `jiti`, in-process). The
**native path** requires the adopting project to install a separate `reflection-check`
engine package and supply a config module exporting `createReflectionConfig(request)`.
`native-engine.ts` resolves that engine from the project's own module tree, verifies
its pinned version and required capabilities (`browserCaptureObservation: 1`,
`externallyManagedBaselines: 1`), then spawns its CLI as a child process. The
engine drives the browser and writes a raw report; this package reads and validates
that report through `native-report.ts` before converting it to provider evidence.
The adopting project supplies the engine, the browser stack and the config; this
package supplies the admission and validation contract.

The adapter plugs into `@penpair/core` through `defineAdapter`. The core loads it
from the adopting project's `adapters` list in `penpair.config.json` and names it
nowhere; the dependency runs one way only. It is usable independently of
`@penpair/marwes-ui`.

## Interface

Re-exported from `index.ts`, and therefore the package's public surface:

- `default` — the `defineAdapter({ name: "@penpair/reflection-check", commands: [...] })`
  result. Contributes exactly one command, `reflection`, with subcommands `plan`
  and `check`. No `status()` line and no build kits.
- `planImplementationCases(config: BaselinesConfig, results: BaselineResult[], mapping: ImplementationMapping, verifiedReferences?: ReadonlyMap<string, ArtifactProvenance>): CasePlan`
  — pairs configured baseline frames with explicit setup names, admitting only
  cases whose approval provenance matches exactly and routing everything else to
  `pending`. The optional fourth argument, when supplied, short-circuits provenance
  lookup and uses the caller's pre-verified map instead.
- `runImplementationCases(root: string, plan: CasePlan, provider: ImplementationProvider): Promise<ImplementationReport>`
  — walks the planned cases, invokes the provider per case and validates what
  comes back. A per-case failure is recorded as incomplete rather than aborting
  the run.
- `runNativeReflectionCases(root: string, plan: CasePlan, options: NativeReflectionOptions): Promise<ImplementationReport>`
  — native path entry point. Resolves the project's pinned `reflection-check`
  engine, materialises read-only baseline copies, runs the engine CLI, reads and
  validates the raw report, then delegates to `runImplementationCases` with a
  synthetic provider backed by the validated evidence. It returns an all-incomplete
  report, without running the engine, when the plan is incomplete, has pending
  cases, is empty or repeats a case id, and converts any thrown engine error into
  an incomplete report.
- Types: `ImplementationMapping`, `ImplementationCase`, `CasePlan`,
  `BrowserCaptureMetadata`, `ProviderEvidence`, `ImplementationProvider`,
  `ImplementationCaseReport`, `ImplementationReport`,
  `NativeReflectionRequest`, `NativeReflectionOptions`, `ReleaseComparisonBinding`.

Module-level exports used across this directory but **not** re-exported by
`index.ts` (internal to the package; not part of its npm contract):

- `runReflectionCommand(context: AdapterContext, commandArguments: string[]): Promise<number>`
  (`command.ts`) — argument parsing, manifest loading, provider loading and exit-code
  selection for the `reflection` command.
- `validateProviderEvidence(evidence: ProviderEvidence, implementationCase: ImplementationCase): void`
  (`evidence-validation.ts`) — throws unless the provider independently observed
  the exact requested case.
- `validateCaptureMetadata(capture: BrowserCaptureMetadata, implementationCase: ImplementationCase): void`
  (`capture-validation.ts`) — throws unless browser capture geometry, fonts,
  pointer position, scroll and occlusion evidence are all sound.
- `hashImageBytes(bytes: Buffer): string` and
  `readImageEvidence(root: string, file: string): Promise<{ bytes: Buffer; width: number; height: number }>`
  (`image-evidence.ts`) — sha256 over image bytes, and a thin pass-through to the
  core's image reader.
- `resolveNativeEngine(root: string, expectedVersion: string): Promise<{ api: NativeEngineApi; cli: string }>`
  and `executeNativeEngine(...)` (`native-engine.ts`) — locates the project's
  installed `reflection-check` package, verifies its version and API shape, and
  spawns its CLI as a child process.
- `validateNativeConfiguration(value: unknown, request: NativeReflectionRequest): NativeConfiguration`
  and `nativeCaseReference(value: unknown): string` (`native-config.ts`) — validates
  the object returned by the project's `createReflectionConfig`, requiring declared
  inputs, measured evidence hooks, exact case coverage and no `beforeRun` mutations.
- `readNativeReport(...)` (`native-report.ts`) — reads, size-checks, validates
  schema, input hashes and result hashes of the engine's raw `report.json`, and
  constructs per-case `NativeCaseEvidence` entries.
- `bindNativeArtifactManifests(root, request, observations)` (`native-artifacts.ts`)
  — writes a per-case `<id>-artifacts.json` manifest in the run directory,
  re-verifying baseline and screenshot hashes before writing.
- `assertReleaseComparisonBinding(binding: ReleaseComparisonBinding, plan: CasePlan): void`
  and `NativeEngineApi` interface (`native-types.ts`) — structural pre-check that
  a binding covers exactly the complete plan before any I/O.
- `validateReleaseComparison(root, plan, binding, expectedFileId?): Promise<void>`
  (`release-binding.ts`) — loads finalized release evidence from the core and
  checks every identity field and per-case detail against it. The strongest
  guarantee this package offers.

This directory has no subdirectories.

## Invariants

**Adapter boundary**

- The dependency runs one way: this package imports `@penpair/core`, and the core
  never imports this package. The core must keep naming neither adapter.
- The adapter may contribute CLI commands, an optional `status()` and build kits.
  It must not register MCP tools or registry snippets, and must not claim a
  reserved command name. It currently claims only `reflection`.
- It is released at the same version as every other package in the repository.
  Never bump the version by hand.

**Persisted schemas — these literals are on-disk compatibility, not decoration**

- `ImplementationMapping`, `CasePlan`, `ProviderEvidence`, `BrowserCaptureMetadata`
  and `ImplementationReport` all pin `schemaVersion: 1`.
- The baseline manifest is required to carry a `frames` array and to have a
  `fileId` equal to the configured file pin (`context.config.file.id`). Schema
  version `2` or `3` is accepted; anything else is refused. Enforced in
  `command.ts:89`.
- `CasePlan.kind` is `"implementation-case-plan"`;
  `ImplementationReport.kind` is `"implementation-case-evidence"`.

**Evidence, never approval**

- `visualApproval` is always `false`, `verdict` is always
  `"owner-review-required"`, and `accessibility` is always `"not-assessed"`.
  A pixel ratio is checker evidence; it is never a visual verdict, an
  accessibility assessment or an owner approval.
- The provider interface is an evidence contract, not a sandbox and not a
  cryptographic attestation. A trusted provider can lie. Loading it executes
  project code.

**Planning admission rules**

- A case is planned only when all of these hold: the frame has a `route` and a
  `case`; a matching `BaselineResult` exists; the mapping supplies an explicit
  `setup`; and approved provenance is available (either from `verifiedReferences`
  or from `matchingBaselineReference`). Everything else goes to `pending` with a
  reason. No setup is ever silently defaulted.
- **A frame with no `route` is out of scope, not pending.** `baselines-config.ts`
  defines such frames as exported but never checked, so the planning loop skips
  them before any admission test. The one case that *is* reported: if the mapping
  names a configured frame that has no route, the author asked for a check that
  cannot be performed, so it becomes `pending` with reason
  `"Mapping names a configured baseline that has no implementation route, so it is exported but cannot be checked"`.
  A mapping id matching no configured frame at all gets a different reason.
  Enforced in `case-plan.ts:112–130`.
- Mapping validation: `schemaVersion === 1`, at most 1000 cases, unique non-empty
  string ids, and each `setup` matching `/^[a-zA-Z][\w.-]{0,100}$/`.
- `complete` is true only when `pending` is empty *and* at least one case was
  planned. An empty plan is not a pass. Enforced in `case-plan.ts:137`.
- `threshold` falls back to `0.05` when both `frame.threshold` and `config.threshold`
  are unset. Enforced in `case-plan.ts:88`.
- The intent is deep-copied (`structuredClone`) into the case, and copied again
  before being handed to the provider, so a provider cannot mutate the plan.

**Release binding — the package's strongest guarantee**

- `assertReleaseComparisonBinding` (enforced in `native-types.ts:53–75`) is a
  structural pre-check that throws
  `"Release comparison requires the exact complete release case inventory"` if
  any of these fail: `binding.reference` is absent; `binding.designHash` is not
  a 64-character lowercase hex string; `binding.caseIds` is empty or has
  duplicates; the sorted case-id list does not match the plan's sorted case-id
  list exactly; `binding.caseThresholds` does not cover every case with matching
  per-case thresholds; or `plan.complete` is false or `plan.pending` is non-empty.
- `validateReleaseComparison` (enforced in `release-binding.ts:6–53`) then loads
  the canonical finalized evidence from the core and throws
  `"Release context differs from its canonical finalized evidence"` if any
  top-level field diverges: `canonical.fileId` (when an expected file id is
  supplied), `canonical.designHash`, sorted `caseIds` observation hash, or
  `caseThresholds` observation hash. It then iterates every planned case and
  throws `"Case ${id} does not match the release's exact approved source, intent and policy"`
  if `sha256`, `scale`, `source.fileId`, `source.pageId`, `source.frameId`,
  `route`, `threshold`, or `observationHash(intent)` diverges from the canonical
  record. This check runs before the native engine executes and again after, so
  a release context that changes mid-run is caught.
- When `--release-context` is supplied to `check`, the loaded file must carry
  `finalized: true`, `ready: true`, and no `truncated` flag. Enforced in
  `command.ts:147–158`.

**Native engine admission rules**

- `resolveNativeEngine` requires an exact semver version (`/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/`).
  The resolved package name must be `"reflection-check"` and its `package.json`
  `version` must equal the pinned value exactly. The package must expose a
  `bin.reflection` entry that is relative and path-traversal-free. Enforced in
  `native-engine.ts:15–65`.
- The loaded API must carry `reflectionCapabilities.browserCaptureObservation === 1`
  and `reflectionCapabilities.externallyManagedBaselines === 1`, and must export
  `hashReportInputs` and `computeResultHash` as functions. A package lacking these
  capabilities is rejected. Enforced in `native-engine.ts:43–52`.
- Native case IDs must match `/^[a-z0-9][a-z0-9_-]{0,63}$/` and baseline images
  must be PNG or WebP. Enforced in `native-runner.ts:62–65`.
- Engine inputs are hashed before and after execution; any change throws
  `"Native engine inputs or approved references changed during execution"`.
  Enforced in `native-runner.ts:191–193`.
- The native config returned by `createReflectionConfig` must not set
  `lifecycle.beforeRun` — mutations before the run are not permitted. Enforced in
  `native-config.ts:46–52`.

**Evidence validation rules**

- Baseline bytes are hashed before the provider runs and again after, and must
  equal `baseline.sha256` both times. A baseline that changes mid-run fails.
- `baseline.scale` must be finite and greater than zero.
- The resolved screenshot path must differ from the resolved baseline path;
  evidence must be independently captured.
- Both images must measure exactly `round(viewport.width * scale)` by
  `round(viewport.height * scale)`, and must match each other.
- Provider evidence must echo `id`, `route` and `setup` exactly, satisfy
  `observationHash(observed) === observationHash(requested)`, carry
  `baselineHash === baseline.sha256`, report `fontsReady === true`, include every
  declared font, name a provider with a version, and give a finite
  `diffPixelRatio` within `[0, 1]`.
- A provider named `penpair-browser-starter-rgba-exact` must supply complete
  capture metadata including `occlusion`.
- When `capture` is present: `rounding === "outward-css-pixels"`,
  `deviceScaleFactor === baseline.scale`, a named and versioned browser, `clip`
  derived from `rootBox` by `floor`/`ceil` with clip dimensions equal to the
  intent viewport, `layoutSamples >= 3` as an integer, the pointer outside the
  root with zero hovered controls, finite scroll offsets, and — if occlusion is
  reported — at least one sample with `blocked === 0`.

**Command contract**

- Subcommand must be `plan` or `check`, with no positionals. `--map` is always
  required. `plan` refuses `--provider`, `--engine-config`, `--engine-version` and
  `--release-context`. `check` requires exactly one of `--provider` or
  `--engine-config`; if `--engine-config` is given, `--engine-version` is also
  required. `--release-context` is optional with either check form. Enforced in
  `command.ts:51–69`.
- Exit codes are part of the contract: `0` complete evidence within thresholds,
  `2` measured drift, `3` missing or incomplete evidence.

## Side Effects

- **Reads** `<baselines.root>/penpair-baselines.json` through the core's
  `readDesignJson`, and the `--map` file with a 1 MiB (`1024 * 1024`) ceiling.
- **Executes project code.** The provider path loads the `--provider` module with
  `createJiti(...).evalModule(...)` (`moduleCache: false`, `tryNative: false`,
  `forceTranspile: true`) and runs its `runCase`. The native path loads the
  `--engine-config` module the same way (`moduleCache: false`, `tryNative: false`,
  `forceTranspile: true`) and calls
  its `createReflectionConfig`. Both execute with full process privileges; every
  transitive import they pull in does too.
- **Spawns a child process** on the native path: the project's `reflection-check`
  CLI is run via `process.execPath` with `run --config <generated> --mode smoke --ci --report-dir <runRoot>/engine
  --case <id>...`. stdout and stderr
  are forwarded line-by-line to `onProgress`. The process is abortable via
  `options.signal`.
- **Reads and writes the project output tree** on the native path. A unique
  `.penpair/reflection/native/<uuid>/` directory is created per run. It holds
  read-only baseline copies (mode `0o400`), a generated wrapper config, a
  `request.json`, the engine's raw reports and a final `implementation-report.json`.
  Per-case `<id>-artifacts.json` manifests are written by `native-artifacts.ts`.
- **Reads image bytes from disk** three times per case on the provider path: the
  baseline, the provider's screenshot, then the baseline again.
- **Hashes** image bytes and file bytes with `node:crypto` `createHash("sha256")`.
- **Delegates uncontrolled work** to `provider.runCase()` (provider path) or the
  engine child process (native path), which may launch a browser, make network
  calls and write screenshot files. None of that is bounded by this package.
- **Writes to stdout**, emitting the report as pretty-printed JSON through
  `context.output?.log ?? console.log`, and passing it to `context.output?.result`.
- **Returns a process exit code**, and throws `Error` for usage, configuration and
  manifest failures.
- Makes no network calls of its own, and never writes to a Penpot instance.

## Verification

- Run: `pnpm test` (from `packages/reflection-check`)

`pnpm check` is the repository's full gate, but its first step shells out to
`git ls-files`, so it cannot run in a tree without a `.git` directory.
