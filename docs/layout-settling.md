# Bounded layout settling

Normal operation writes, PNG exports, baselines, shots and token push verification now use `waitForStableLayout`. A supported shape/global native wait is preferred. Older APIs fall back to geometry samples, requiring three consecutive equal observations of the target subtree. Missing targets, changed file/page identity, malformed sampled geometry and expired budgets cannot establish stability. Native failure falls back to geometry in `auto` mode; `native` mode still requires a successful native wait.

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
