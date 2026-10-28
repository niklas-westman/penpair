# Bounded layout settling

Normal operation writes, PNG exports, baselines, shots and token push verification now use `waitForStableLayout`. A supported shape/global native wait is preferred. Older APIs fall back to geometry samples, requiring three consecutive equal observations of the sampled geometry and hierarchy. Bounded samples can establish only partial evidence, as described below. Missing targets, changed file/page identity, malformed sampled geometry and expired budgets cannot establish stability. Native failure falls back to geometry in `auto` mode; `native` mode still requires a successful native wait.

The default layout budget is 30 seconds, with 200 ms fallback intervals. A run is also limited to 1,000 samples. Each layout observation forwards its remaining request budget through guards to the MCP SDK and disables suspension retries; a read timeout does not silently restart the budget. Custom clients must honor the optional `ToolCallOptions.timeoutMs` contract. A late native response is rejected even if it claims completion. The overall CLI `--timeout-ms` remains a separate bound on the complete command.

Journaled operations settle the selected page before planning and inspect again around the actual write. Their recovery observations also require settlement, so a resume cannot skip failed layout verification merely because values arrived. Nonjournaled `runOperation` settles after its acknowledged write and before independent readback. Token push verifies layout before structural comparison and during journal reconciliation. Reports and capture provenance retain the settlement method and sample count when measured.

Exports retain the first capture as an initial observation, wait for layout, and still require two consecutive matching renders. Thus a stale first render cannot be accepted merely because native layout finished. Stable geometry does not prove token bindings persisted, fonts loaded, themes resolved correctly, or pixels match the intended design. Positive readback and looking at the images remain separate requirements.

The previous unconditional ten-second operation sleep is replaced by bounded evidence. Library callers can retain an explicitly measured `settleMs` minimum from 0 to 30 seconds for an additional asynchronous contract such as binding persistence. It is a delay, not verification. A missing binding still fails independent readback and may be reconciled through the journal once it arrives. Page switching retains its existing short navigation delay. No new live timing or compatibility claim is made.

Library options may select a target and budget through `layout`, or explicitly set `layout: false` when the caller supplies its own settlement evidence. CLI design commands do not expose that opt-out. Multi-step mutations remain nontransactional: a post-write layout failure can leave completed work applied; inspect the run and explicitly resume after resolving it. The later build kit should reuse these primitives rather than introduce another fixed-sleep convention.

## Scope and node budgets

`run-file`, `run`, `archive`, token edit writers, `export` and `shots` accept:

```sh
penpair run-file design/build.js --inspect design/inspect.js --readback design/readback.js \
  --page Candidate --layout-root BOARD_ID --layout-root OTHER_BOARD_ID \
  --layout-max-nodes 20000 --apply
```

Each repeatable `--layout-root` identifies an existing shape on the operation's page. Roots must be distinct, nonoverlapping subtrees. Missing roots refuse rather than falling back to the page. The same roots are observed before planning, after writing and during recovery. New shape IDs cannot be selected before creation; select their existing parent or use the page default. Without explicit roots the current page is sampled; exports retain their existing shape scope. Library callers use `layout.shapeIds` (or the existing singular `shapeId`) and `layout.maxNodes`.

`--layout-max-nodes` is an integer from 1 to 100,000, shared across the selected subtrees; the default remains 10,000. When the traversal exceeds it, the observer retains a bounded depth-first prefix. A successful native wait or three equal bounded samples can continue the operation with `method: "partial"` and `truncated: true`. This establishes stability only for the sample, not for unsampled shapes. Invalid geometry, cycles or duplicate IDs encountered in the sample still refuse. Use explicit roots for complete evidence on a large page. Partial evidence never replaces positive independent write readback or visual export inspection.

Reports and journal observations, visible through `penpair runs RUN_ID`, record `rootIds`, `nodeCount` (the sampled count), `maxNodes` and `truncated`. The sample count is a lower bound on subtree size when truncated. Journal input hashes retain the chosen scope and budget, so changing either requires a new run. The build kit's `pp.settle(root, {maxNodes})` shares this policy and evidence; it also accepts an array of root shapes.

## Default scope for `run-file`

`run-file` does not sample the whole page unless asked. Its default scope is `inspected`: the roots are the shape IDs the inspect script returns as `layoutRoots`. Explicit `--layout-root` wins; `--layout-scope page` samples the page as before. With no roots, the report carries `layout.method: "skipped"` and a reason; the layout check is not silently claimed as stable evidence, and positive readback plus a looked-at export remain required. Other commands (`archive`, token edits, `export`, `shots`) keep their previous scope.

## When a flush or layout check fails

- **Budget limit.** The settling budget is at most 30,000 ms (`timeoutMs`), at most 1,000 samples and 1–100,000 nodes. A refusal now says which value is wrong and what the maximum is (`Invalid layout settling budgets: timeoutMs must be from 1 to 30000 (got 45000)`). `pp.flush({ timeoutMs })` refuses a longer budget up front. When a build needs longer, split it into staged flushes (`run-file --stages`, one new subtree per `pp.flush({ root })`) instead.
- **`pp.flush` failures.** A deadline or settle failure carries `[phase …; N binds applied, M binds and K styles still queued; X nodes sampled under the root; slowest bind … ms on "name" (id …); ms per phase {...} of a … ms budget]`. The slowest bind is the nearest cheap signal for a heavy component instance. A successful flush returns the same `phases` and `slowest`.
- **Layout check failures.** `Layout did not settle` names the sample count, the nodes sampled, the elapsed time and the roots (or "whole page").
- **Malformed geometry.** The error names the offending shape: no id (with its name and type), duplicate id, or non-finite fields, and where it sits (`index 3 under "Board" (id …)`). A shape with no id is typically left by an interrupted run; observe a different root with `--layout-root`, or remove them with `penpair repair --page PAGE --empty-shapes`.
- **Empty flush root.** `pp.flush({ root })` refuses an explicitly falsy root before any layout or queued work. A selector that returned nothing therefore fails instead of widening scope. Resolve shapes with `pp.find` from `@instances` for a match-count error. Omit the `root` key when whole-page scope is intentional; `pp.settle(undefined)` retains its separate page-root default.


## Pending live verification

The generated-policy and explicit-root tests are offline evidence. They do not
establish a live performance improvement or a new Penpot compatibility pass.
Before live work, record the CLI version/source commit, expected Penpot version,
origin, file/page identity and owner-authorized scope without exposing credentials.

1. Run the [Q-SELF probe](designs/penpot-revision-conflicts.md#q-self--the-probe-that-gates-everything)
   on scratch, allowing for delayed revision updates. Record the observation
   window. A negative result does not identify the historical conflict cause.
2. Run ordinary `penpair probe` against the separately pinned 2.18.3 and 2.18.4
   targets and record `shapeApis.layoutWait` in [compatibility](compatibility.md).
   Presence is not a successful behavior test; do not change pins casually.
3. Measure a heavy board built once with `pp.flush()` and once with
   `pp.flush({ root })`, using equivalent scratch starting states, board/instance
   counts and matching owned markers. Ensure both runs actually execute the
   build rather than returning already-satisfied. Use the example's returned
   `layout`, `phases` and `slowest`, plus traced journal timings, to distinguish
   binding cost, script flush cost and the host's post-write layout check.
4. Record roots, node/sample counts, partial status, per-phase timings and
   slowest binding alongside each version/target. Follow the write protocol:
   pin the inspection, perform the idempotent write, independently read back,
   then export and look twice. Interpret results using the
   [measurement verdicts](designs/fewer-lost-penpair-runs.md#measurement).

Changed snippet hashes can refuse resume of outstanding journals. Package
version and implementation guards remain in force; reconcile the original run
and use its compatible implementation rather than bypassing guards or silently
restarting uncertain writes. No journal schema or revision guard changes here.
