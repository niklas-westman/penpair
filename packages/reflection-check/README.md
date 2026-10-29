# @penpair/reflection-check

The recommended companion when you implement a frontend from Penpot and want repeatable visual checks against approved designs. It is an optional package installed alongside one command package at the same reviewed version and registered in `adapters`.

**Penpot design → approved reference and handoff → frontend code → browser capture → comparison → owner review.** Start with the [companion setup guide](https://github.com/niklas-westman/penpair/blob/main/docs/adapters.md#check-the-frontend-against-the-design) for installation, registration and the readiness checklist. Installing the package does not configure application state or supply a browser provider.

It depends on the neutral core; the core does not load or depend on this adapter.

The generated Reflection `visualSmoke` configuration remains available for legacy
cases. Rich theme/state/fixture/font cases use either a trusted custom provider or
the native batch bridge below. The adapter does not bundle a browser. Custom
providers use the project's pinned browser/checker; native mode requires an exact
project-installed Reflection version advertising the public capabilities described
below. Neither path configures the application's setup by installation alone.

```sh
penpair reflection plan --map design/implementation-cases.json
penpair reflection check --map design/implementation-cases.json --provider design/reflection-provider.mjs
```

Mapping: `{"schemaVersion":1,"cases":[{"id":"dashboard-empty-dark","setup":"dark-empty"}]}`. A case must have validated approved provenance, matching effective file/page/frame and case intent, and an explicit setup name. Missing mappings, legacy approvals and changed case metadata remain pending. No setup is silently replaced by the default route state. Baselines remain owned by the core; this adapter neither captures nor approves design references.

The provider module exports `async runCase(test)` and receives the immutable case ID, route, setup key, declared intent, baseline relative path/hash/scale and threshold. It must activate the route/theme/state/data fixture, verify actual browser state and fonts independently, capture a new static lossless WebP at the requested scale (legacy PNG evidence remains supported), and use the installed checker to compare it with the approved image. It returns:

```json
{
  "schemaVersion":1,"id":"dashboard-empty-dark","route":"/dashboard","setup":"dark-empty",
  "observed":{"viewport":{"width":1280,"height":900},"theme":"dark","state":"empty","fixture":"no-items"},
  "fonts":["Expected Font"],"fontsReady":true,"baselineHash":"EXACT_SHA256",
  "screenshot":".penpair/comparison/dashboard.webp","diffPixelRatio":0.01,
  "provider":{"name":"PROJECT_PINNED_CHECKER","version":"ACTUAL_VERSION"}
}
```

Observed context must come from browser readback, not copied test inputs. The adapter checks context/font evidence, independent screenshot path, exact image dimensions, byte hashes and unchanged baseline bytes. A trusted provider can lie: this interface is an evidence contract, not a sandbox or cryptographic attestation of browser work. Modules and transitive imports execute project code. Pixel ratios are checker evidence, never a visual verdict, accessibility assessment or owner approval. Exit 0 means complete evidence within thresholds; 2 means measured drift; 3 means missing/incomplete evidence. Every result still says `owner-review-required`.

The shipped browser starter has been exercised against local fixture routes; the
adapter's offline integration test uses a named stub. Neither establishes parity
for a consumer's implementation. Use the shipped `penpair-verify` skill, run the
consumer's real provider against approved references and retain the resulting
images before claiming comparison readiness. Owner review remains separate.
Release/publishing is the owner's act and all six packages remain in lockstep.

Evidence formats are detected from bytes, not filenames: PNG and static lossless
WebP (`VP8L`, including a matching `VP8X` canvas) are accepted. Lossy or animated
WebP and malformed/truncated containers are rejected. The adapter inspects image
metadata and hashes; the project provider owns actual decoding and pixel comparison.
Existing PNG baseline approvals retain their exact bytes and hashes. New core
baseline/approval images default to lossless WebP; public Penpot PNG exports remain
PNG. Existing approved references are never silently converted.

The browser starter saves `.webp` evidence by default. Supply `encodeLosslessWebp`
from the project's pinned codec, for example Sharp with `lossless: true` and
`exact: true` to preserve transparent-pixel RGB. The starter independently checks
that encoding preserves decoded pixels before saving. Use `imageFormat: "png"`
for an explicit legacy provider path. Neither the adapter nor core gains a native
image-codec runtime dependency.

## Native Reflection batch bridge

The adapter also supports the project's pinned standalone engine through its
public CLI and raw report. Custom `--provider` modules remain supported.

```sh
penpair reflection check --map design/implementation-cases.json \
  --engine-config design/reflection-native.ts --engine-version EXACT_VERSION \
  --release-context design/releases/1.0.1/context.json
```

**Activation dependency:** published Reflection 0.7.0 lacks the measured-capture
and externally-managed-baseline capabilities this bridge requires. The upstream
extension has been implemented and tested locally; pin its reviewed public release
when available. The adapter requires the public capability values
`reflectionCapabilities.browserCaptureObservation === 1` and
`reflectionCapabilities.externallyManagedBaselines === 1`, along with the public
input/result-hash helpers. Version equality alone is insufficient; unsupported
engines fail before comparison. Do not switch a project to native mode until
capture/comparator parity and its complete case matrix pass. A passing local
fixture is not consumer comparator parity or live Penpot release acceptance.

The engine is resolved relative to the trusted project module, supporting
project/monorepo dependency scoping. This never fetches a global engine.

The trusted project module exports
`createReflectionConfig(request: NativeReflectionRequest): ReflectionConfigInput`
(or a promise). Import the request type from this adapter and the config/evidence
hook types from standalone `reflection-check`. Use `defineReflection` to typecheck
the returned config; no private runner imports are needed.

`request` contains complete cases, their content-bound `reference`, verified
read-only `baselineRoot` copies and a unique `runRoot`. Each case's `baseline.path`
points to its copied reference. For each native `visualSmoke` case return:

```ts
{
  id: test.id,
  ref: test.reference,
  route: reviewedRouteId,
  viewport: reviewedViewportName,
  baselineRoot: request.baselineRoot,
  baseline: path.basename(test.baseline.path),
  externallyManaged: true,
  capture: { selector: reviewedUniqueRoot, measured: true },
  threshold: { maxDiffPixelRatio: test.threshold },
  blocking: true,
}
```

Provide matching browser routes/states and public `evidenceHooks`:
`beforeNavigate` for interception, `prepare` for setup,
`observe` for independent DOM theme/state/fixture readback, and `expectedFonts`
for explicit font family/weight/style. Native capture measures actual URL,
viewport, fonts, unique root geometry, clip, stable layout, pointer and occlusion.
The adapter requires the actual captured URL to equal the reviewed config's
route/state URL on its configured application origin. Route IDs and requested
labels alone do not establish this proof.

Declare implementation, fixture, hook/import, mapping, lockfile and policy inputs
in `config.inputs`, relative to the project module's directory. Pin browser and
platform for migration comparisons. Native invocation freezes and rechecks input
hashes, original reference bytes and read-only copies. Setup mutation through
`lifecycle.beforeRun` is rejected; prepare the app before invoking the comparison.
The project module and its imports remain trusted executable code.

One native invocation runs the batch with a shared browser and isolated contexts,
streaming redacted progress on stderr. Reports, original reference copies,
screenshots, diffs and per-case hash-bound artifact manifests (including the raw report hash, actual
observations and comparator identity) are written beneath
`.penpair/reflection/native/<unique-invocation>/`. The final adapter report is `implementation-report.json`. Each successful case
also binds an `implementation-comparison-artifacts` manifest by path and SHA-256;
that manifest records reference/screenshot/diff hashes, setup, intent, capture and
comparator policy, threshold and measured ratio. Preserve the entire run directory
for later status and review: replacing an image invalidates the bound evidence.
Raw engine reports must include exact case coverage, reference/policy bindings and
measured evidence. Missing cases,
failed setup/capture, mutated inputs/artifacts and cancellation produce incomplete
evidence. Stock summary output is never used as a raw report substitute.

`--release-context` is optional outside a release workflow. When supplied, it must
be an untruncated ready finalized context with the exact complete case inventory
and frozen `caseThresholds`, plus a `releaseReference` pinning the canonical final
record and bundle paths/hashes:

```ts
releaseReference: {
  record: { path: canonicalFinalRecord, sha256: exactRecordHash },
  bundle: { path: immutableBundle, sha256: exactBundleHash },
}
```

Generate this context with `penpair design-release context --from FINAL_RECORD
--out CONTEXT_FILE`. Older contexts missing the reference must be regenerated;
do not hand-add readiness flags or hashes. Native and custom-provider paths use
core `loadReleaseComparison` to reload the pinned finalized evidence and bind the
exact approved image hash/scale, source file/page/frame, route, case and threshold.
Saved ready/finalized/ID labels alone cannot authorize a release comparison.
The canonical proof is checked before and after execution. The adapter rejects
missing/extra cases, pending mappings, duplicate IDs and any threshold mismatch. Each frame's effective threshold is `frame.threshold ??
baselines.threshold ?? 0.05`; use the context's `proposedBaselines` to preserve the
frozen per-case values. A stricter or looser local policy is still a mismatch, not
a release comparison. The report preserves its `designHash`, `caseIds` and
`caseThresholds` binding. Measured pass/drift remains separate from owner acceptance;
no command here rewrites a finalized design or approves a reference. Assess the
saved adapter report with `design-release status --from RELEASE --comparison
REPORT_FILE` (also supported by `check` and `context`). In context,
`implementation` preserves the historical handoff fields;
`implementationAssessment` and `workflow.implementation` describe the current
validated comparison. A measured pass still leaves owner acceptance unrecorded.

Validation includes a stub public-CLI/report contract suite and a real Chromium
fixture against the local upstream extension. Run the latter explicitly with
`PENPAIR_NATIVE_ENGINE_PATH=/path/to/extended-reflection` and
`pnpm --filter @penpair/reflection-check exec vitest run test/native-browser.test.ts`.
It remains skipped when that external engine checkout is unavailable.

Library callers producing comparison context must pass the canonical finalized
record as `releaseContext(root, release, { pointerPath: recordPath })`.
`runNativeReflectionCases(..., { release })` requires the corresponding
`ReleaseComparisonBinding.reference`; the direct API revalidates canonical proof
rather than trusting the supplied summary fields. These references identify the
Penpair finalized record, not a Projection-only snapshot.
