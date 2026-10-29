# Companion adapters

Penpair connects the design workflow to the libraries and implementation tools a project already uses. Choose the command package for your Penpot connection, then add companions for your intended workflow.

| Your workflow | Recommendation | Required project inputs |
| --- | --- | --- |
| Inspect, build and export Penpot designs | One of `@penpair/web` or `@penpair/docker` | A configured connection and pinned design file |
| Use Marwes UI in the frontend and Penpot | Add `@penpair/marwes-ui` | Installed library, project theme and reviewed token declarations |
| Implement frontend code and compare it with Penpot | Add `@penpair/reflection-check` | Approved design baselines, explicit cases and a real browser provider |

Adapters are installed and registered explicitly. Both companions can be used together; a comparison workflow does not require the library adapter. Keep the command package, its resolved core and directly installed adapters at the same reviewed version. Do not install both command packages.

## Bring your component library into Penpot

`@penpair/marwes-ui` connects the installed Marwes library and project theme to token snapshots, ownership-aware drift checks and reviewed token operations. It also provides compositional recipes and a measured-component pilot. Native component generation remains gated on actual override-preservation proof.

Use it when your application uses Marwes UI. Follow the [adapter overview](marwes.md), [token configuration](marwes-tokens.md) and [build-kit guide](build-kit.md). Other libraries need their own adapters or explicit project declarations; the core contains no library defaults.

## Check the frontend against the design

**Recommend `@penpair/reflection-check` whenever frontend implementation and visual verification are part of the task.** It connects an approved Penpot design case to the corresponding running application case:

1. Inspect the design and create a [handoff](handoff.md).
2. Capture and review [baseline cases](coverage.md), including viewport, theme, state, fixture and fonts.
3. Implement the frontend using the project's actual components and behavior.
4. Map each approved design case to explicit application setup.
5. Run a project provider to open that state, read it back, capture the browser and compare the image.
6. Review the screenshots and differences; record human approval separately.

The adapter checks that the returned evidence identifies the requested case and expected state, references the correct unchanged baseline, and has matching image dimensions/scale (PNG or static lossless WebP) and font evidence. A complete result within the configured difference threshold is technical evidence, not visual approval or an accessibility assessment.

The provider is project code with an `async runCase(test)` export. It supplies actual route/theme/state/fixture setup, browser readback, screenshot capture and image comparison through the project's pinned tools. It can integrate the project's existing Reflection/browser checker. The adapter itself does not install a browser or execute a particular Reflection engine automatically.

### Install and register

First check your installed command version:

```sh
pnpm exec penpair --version
```

For example, a project whose command/core are **0.3.0** installs this matching
companion. Use the actual installed version when it differs:

```sh
pnpm add -D -E @penpair/reflection-check@0.8.1
```

Use the version printed above when it differs. In a pnpm workspace, use the existing dependency location (`-w` when installing at the workspace root). Upgrade directly installed Penpair packages together rather than mixing releases.

Append the adapter to the existing `adapters` array in `penpair.config.json`, preserving other fields and already configured adapters:

```json
{
  "adapters": ["@penpair/reflection-check"]
}
```

That JSON is a fragment to merge, not a replacement project config. The library companion is installed the same way at the matching version and registered as `@penpair/marwes-ui`; only register packages you have installed.

### Progress from installed to working

- [ ] **Installed and registered:** the matching adapter dependency and config entry exist. `penpair --help` can identify configured extensions without executing them.
- [ ] **References ready:** configured file pin and baseline frames have current exact approved provenance and explicit case metadata.
- [ ] **Mapping ready:** `design/implementation-cases.json` maps each baseline case ID to its project setup name.
- [ ] **Execution ready:** a reviewed custom provider exports `runCase`, or the native public-config bridge passes its capability and exact-version checks. Actual browser work supplies observations; requested inputs are not copied into results.
- [ ] **Verified in the browser:** the plan has no pending cases, the provider executes the intended cases and the owner looks at the resulting images.

```sh
pnpm exec penpair reflection plan --map design/implementation-cases.json
pnpm exec penpair reflection check --map design/implementation-cases.json --provider design/reflection-provider.mjs
```

Use the [package reference](https://github.com/niklas-westman/penpair/blob/main/packages/reflection-check/README.md) for mapping/provider examples. Exit **0** means complete evidence within threshold, **2** means measured drift and **3** means missing/incomplete evidence. An install, a passing setup check or a stub provider is not a completed frontend comparison.

The browser-provider starter ships with the command package; supply real project
hooks or report integration as pending. The shipped
[penpair-verify skill](../packages/core/skills/penpair-verify/SKILL.md) guides
comparison, image inspection, implementation fixes and recapture. For simple
legacy route/viewport checks, the existing generated `reflection-cases.json` and
`visualSmoke` configuration remain available; richer cases require explicit setup
and readback.

### Native Reflection for release comparisons

Custom `--provider` modules remain supported. Native mode uses the project's exact
standalone `reflection-check` version, public CLI and raw run report:

```sh
pnpm exec penpair reflection check --map design/implementation-cases.json \
  --engine-config design/reflection-native.ts --engine-version EXACT_VERSION \
  --release-context design/releases/1.0.1/context.json
```

`EXACT_VERSION` is a placeholder for a reviewed installed engine release. Published
Reflection 0.7.0 alone does not enable this path: it lacks the public measured-capture
and externally-managed-baseline capabilities required by the bridge. An upstream
extension has been exercised locally; native consumer migration remains pending
until a reviewed public engine release and project capture/comparator parity are
available. Do not replace missing proof with copied configuration or use private
runner imports.

The trusted project module exports `createReflectionConfig(request)`, using the
adapter's public `NativeReflectionRequest` type and Reflection's public config and
`BrowserEvidenceHooks` types. Map each request case to its exact content-bound
`reference`, read-only `baselineRoot`, managed image, unique measured capture root
and explicit threshold. Hooks provide pre-navigation interception, setup,
independent DOM state observations and exact expected font family/weight/style.
Declare relevant app, mapping, fixture, hook, lockfile and policy inputs; the bridge
freezes and rechecks them. See the [native bridge contract](https://github.com/niklas-westman/penpair/blob/main/packages/reflection-check/README.md#native-reflection-batch-bridge)
for the public builder fields and capability checks.

A supplied `--release-context` must be ready, finalized and untruncated, with exact
complete `caseIds`, frozen `caseThresholds` and `releaseReference` pinning the
canonical finalized record and immutable bundle by project-relative path/SHA-256.
Generate it with `design-release context --from FINAL_RECORD --out CONTEXT_FILE`;
regenerate older contexts instead of hand-adding labels or hashes. Both native and
custom-provider paths reload canonical proof through `loadReleaseComparison` and
bind approved image hash/scale, source file/page/frame, route, case and threshold.
Saved readiness and inventory labels alone are insufficient. Missing/pending/extra cases or threshold changes reject
the release comparison. Use the full context's `proposedBaselines`, including each
frame's `pageId` and `threshold`, rather than only the latest release page.

Native runs retain `implementation-report.json`, raw engine reports, read-only
reference copies, screenshots, diffs and hash-bound per-case artifact manifests in
`.penpair/reflection/native/<unique-invocation>/`. Preserve the run directory for
review and status; do not reuse screenshot paths across runs. Long-running output
streams on stderr; cancellation produces incomplete evidence.

Use `design-release status --from RELEASE --comparison REPORT_FILE` to assess the
current application without editing the frozen design. The context's
`implementation` is historical; `implementationAssessment` and
`workflow.implementation` are the current assessment. Passing comparison never
records owner acceptance. See [design releases](design-releases.md) for the
separate design and implementation gates.

## Why explicit companions?

The design-only workflow can start with one command package. Frontend projects should be guided toward the comparison companion during setup and handoff. Keeping installation explicit lets each project choose its browser/checker and supply meaningful setup instead of treating an added dependency as a finished integration.

The shipped setup/handoff skills should recommend the appropriate companion, preserve existing adapter configuration and report readiness at each stage. They must keep missing references or provider work visible and never invent owner approval.

Use the shipped [real-browser provider starter](../examples/reflection-browser/README.md) to supply capture plumbing while keeping route/theme/state/fixture hooks project-owned. It includes measured font, pointer, scroll and crop evidence; a browser dependency is not added to the core. The starter saves static lossless WebP with a project-supplied encoder; the adapter also reads legacy PNG evidence without converting approved references.
