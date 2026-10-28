# Fewer lost penpair runs

Flush scope, filter cardinality, and the controls that already ship. Conflict
handling is a separate design: see
[Penpot revision conflicts](./penpot-revision-conflicts.md).

## Status

Implemented locally with automated coverage: Works 1–5, stable sandbox source
generation, and the example's flush reporting. The owner selected A1: explicit
falsy flush roots refuse; omitting the key deliberately retains page scope.

Source citations in the original diagnosis describe the 0.6.0 baseline
(`961cc52`), before these changes. The 0.5.0 field session is reported historical
evidence, not a reproduction on this branch. The proposed refusal initially
failed the consumer-side byte budget, but runtime `settleLayout.toString()` has
now been replaced by a tracked generated string from the same TypeScript source.

Current built kits: `@kit` 29,914 bytes; `@instances` 6,867 bytes; combined wrapped
report 36,914 bytes. Per-source, combined and transport limits are unchanged.
Source tests, built imports and package smoke compare the kit bytes/hashes.

Live capability results on both pinned Penpot versions, Q-SELF and heavy-board
measurements remain unverified. G3, G6 and G7 therefore still require live work.
The revision-conflict investigation is not ready for implementation.

## Overview

An agent driving penpair against a live Penpot file loses runs and loses time. A
session that built a UI kit reported heavy frames that did not settle inside
budget, runs that aborted on a revision conflict without writing anything, and a
`doctor` that reported a healthy connection while the editor was unresponsive.

That session ran penpair 0.5.0. `--stages`, `--layout-scope` and
`repair --empty-shapes` did not exist in that version and `queue run` had not
shipped. It used `--layout native` with `--layout-root <empty board>` on every
write and built its own stage flag (`--part=sN`) and drivers, because no staged
run mechanism existed to find.

penpair at HEAD already ships most of those controls: scoped settling
(`--layout-scope`, `--layout-root`, `pp.flush({ root })`), staged runs
(`--stages`, `queue run`, `--resume`), a challenge round-trip in `doctor`,
`repair --empty-shapes`, `swap` and `iconSize` as kit helpers, and per-step
timings in the journal. So the forward-looking problem is that a script author
starting today cannot find them, and that the baseline masked fallback in `flush` let a
build silently widen its own scope.

This update removes that fallback, adds a filter cardinality guard, records a
capability, qualifies `doctor` output, and makes the shipped controls findable. The measurement that would justify further settle work
must run on HEAD; the 0.5.0 numbers cannot stand in for it.

## The Problem

This section records behavior at the cited baseline; the implemented changes
and remaining live work are distinguished in Status and Sequence.

### A masked fallback lets a flush widen its own scope

`layout-policy.ts:8` already refuses a falsy root:
`if (!roots.length || roots.some(shape => !shape)) throw new Error("layout
target does not exist")`. The only thing preventing that refusal is `flush`
itself, which substitutes the page root at both call sites —
`settle(options.root || penpot.currentPage.root, …)` at `kit-source.ts:248` and
`:271`.

`settle` also carries a page-root default parameter (`:224`), so
`pp.settle(undefined)` page-settles too. `pp.settle` is public build-kit API
(`docs/build-kit.md:27`), and this design does not change it; see *Risks*.

In the reported session the chain ran: a name filter rejected a derived name, so
nothing was cloned, so the cloned-frame variable was `undefined`, so `flush`
substituted the page root. The code path and the session output together point to
this as the cause of the page flush and of whole-page settles in the family of
boards that timed out. It has not been reproduced on HEAD. Nothing was deleted;
the cost was a wasted build.

A second family passed a real board as its root and still failed with
`"Flush deadline exceeded"`. That cost is unattributed and tracked as Q-M. The
per-phase split needed to attribute it is printed on failure
(`kit-source.ts:244`) and returned on success (`:276`) at HEAD — the 0.5.0 output
predates that detail string, which is why the session could not tell its own
flush from penpair's post-write settle.

A related gap on the failure path: `detail()` prints the nodes sampled but never
names the root ids, so a page-wide flush still looks like a scoped one in the
error text. That diagnostic is outside this update; the original baseline had no byte
headroom, while generated source now recovers some margin.

### A filter that matches nothing fails silently

The session's own predicate returned zero matches and the build continued rather
than stopping. Nothing in the kit helpers forces a filter to resolve to an
expected cardinality, so a zero-match filter is indistinguishable from a
successful one until the flush scope reveals it.

### The shipped controls are not findable

`docs/run-file.md:85-91` already prescribes staged runs with per-stage
`pp.flush({ root })`, `layoutRoots` reported from the inspect script, and
`--resume`; `kit-source.ts:236` prescribes the same inside an error message. None
of it is reachable from where a script author starts, and one agent-facing line
teaches the opposite: `packages/core/skills/penpair-recipes/references/build-flow.md`
instructs `await pp.flush()` with no root, which is the habit that produced the
incident.

One documentation sentence is also false: `docs/layout-settling.md:40` states
that a repair command for shapes without an id does not exist, while
`repair --empty-shapes` ships (`operation.ts:674`, `cli-main.ts:156`).

Reaching an operation over MCP is constrained in a way nothing documents:
`run_registered` emits only `run`, `--param`, `--apply`, `--resume` and
`--checkpoint` (`mcp-server.ts:392-415`), so it cannot pass `--layout-root`,
`--layout-scope` or `--stages`, and an operation driven through MCP gets a
whole-page sample regardless of what this design fixes in the kit.

### `doctor` shows a green row beside a failing check

The readiness check is intact: `instance/connection.ts:177-193` throws unless a
fresh `randomUUID()` challenge, the file id and the page id all come back, and
unless transport was independently observed and the file name is a real name. The
misleading output is sequencing: `:155-167` pushes an `ok: true` row labelled
"MCP transport" from the `onTransport` callback *during* `connect`, before the
verdict exists, and `:214-246` then pushes the `ok: false` "editor and plugin"
row. A reader sees green above red.

The tab census is separately skipped in silence: `browserTabsCheck` returns
`undefined` without `--debug-port` (`cli-main.ts:1754-1756`).

No green *editor* row is ever emitted for a probe that did not run — with
`options.mcp` absent, `doctorEditor` returns `[]` (`:146-148`). Both defects are
readable in source and need no interactive reproduction.

### What is not a problem

Board placement. The session computed its own grid and did not read the page to
find free space, so no overlap was ever detected and placement was never measured
as a bottleneck.

## Goals

Each goal names who performs its verification.

* **G1 — A flush cannot widen its own scope.** A maintainer deletes the
  `|| penpot.currentPage.root` substitution at `kit-source.ts:248` and `:271`,
  adds the explicit-`undefined` refusal, and adds unit cases for each falsy
  `root` value and for an absent `root`.
* **G2 — A filter that resolves to an unexpected count stops the build.** A
  maintainer specifies the helper's signature and throw message in *Work 2*, then
  adds unit cases for zero, one and many matches.
* **G3 — The shape-level layout-wait capability is recorded.** A maintainer adds
  `layoutWait: typeof shape.waitForLayoutUpdate` to `shapeApis` in `probe.ts`,
  extends the test fixture with a shape, runs `penpair probe` against both pinned
  Penpot versions, and records the result in `docs/compatibility.md`.
* **G4 — `doctor` never shows a green row beside a failing editor check, and
  never claims a probe it skipped.** A maintainer marks the transport row
  `warning: true` when the editor verdict fails, and emits the skipped tab census
  as `ok: true, warning: true` with a remedy. Verified by tests asserting both
  rows and asserting the exit code is unchanged for a run without
  `--debug-port`.
* **G5 — A script author finds the shipped controls from where they start.** A
  maintainer amends the bare `pp.flush()` instruction in `build-flow.md` and adds
  the routing pointer. Verified by the owner driving one heavy build from that
  reference alone, without consulting source.
* **G6 — The measurement is on record on HEAD.** The owner edits
  `examples/hello-card/build.js` to keep the flush return value, runs one heavy
  board twice, and reads the result against the verdicts in *Measurement*.
* **G7 — The change can be shown to have worked.** After the work lands, the
  owner runs a workload of the same board and instance count as the field session
  and confirms no build is wasted by a filter or scope defect. The before figure
  is one such wasted build.

## Non-Goals

* **Conflict handling.** The revision guard, the content-hash comparison and the
  `revn` probe live in
  [Penpot revision conflicts](./penpot-revision-conflicts.md), which opens only
  when its probe reports.
* **Closing the `pp.settle(undefined)` path.** `settle` keeps its page-root
  default for direct callers. Closing it means changing a documented public
  helper (`docs/build-kit.md:27`) and is a separate decision; see *Risks*.
* **Naming root ids in `detail()`.** It would make a widened scope legible on the
  failure path. This remains outside the update even after recovering byte
  headroom.
* **Per-phase settle sub-budgets.** The attribution they would buy is already
  printed at `kit-source.ts:244` and returned at `:276`, and a fixed share would
  fail builds that pass today by borrowing across phases.
* **Conditioning the before-settle on a constructor whitelist.** The whitelist
  can only see kit constructors, and the hazard is available to any hand-written
  helper that reads geometry and writes derived absolutes. If this returns, it
  returns as an opt-in (`pp.flush({ skipBefore: true })`).
* **A single-stage re-run flag.** `--stages` with `--resume` already re-runs what
  failed.
* **A CLI-verb-to-MCP-tool table.** No incident involved anyone consulting such a
  mapping. The one observed gap is the `run_registered` flag limitation, recorded
  in `docs/mcp.md` as prose.
* **Rebuilding staged builds, scoped settling or a queue runner.** All three ship
  at HEAD.
* **Refusing a write because of unrelated ghost shapes.** `repair --empty-shapes`
  ships for deliberate cleanup, and a write that aborts over a stray shape
  elsewhere is a new way to lose a run. `layout-policy.ts:40` already throws when
  a shape with no id sits inside the sampled root, so narrowing the scope removes
  most of the exposure.
* **A declared layout convention with a placement allocator.** Placement was
  never a measured bottleneck, a deterministic allocator already exists in
  `design-releases/copy.ts:326-339`, and one page per view makes throughput worse
  because a batch cannot span pages.
* **Batched multi-board writes.** Writes receive zero retries
  (`client.ts:275`) and the journal has no per-item sub-state
  (`journal.ts:88-100`), so an uncertain outcome means "between zero and N moved,
  unknown".
* **The five named design operations** — derive device frames, swap,
  componentize, icon inner size, image fill. `swap` (`kit-instances.ts:46-82`)
  and `iconSize` (`:22-44`) already ship; `componentize` crosses a documented
  gate (`marwes-ui/src/components.ts:570`); device derivation without reflow is a
  clone; and `audit-rules.ts:258-267` classifies `fillImage` as unresolvable
  paint, so an image fill has nothing for its readback to assert.
* **A new config block, a new MCP write tool, growth of the adapter contract's
  registration surface, reflow, an overlap audit finding, anything committed to
  git as state, and randomising anything.**

## Open Questions

* **Q-POLICY — Does any script outside this repository pass a possibly-falsy
  `root` to `flush` and rely on the page-wide fallback?** Every caller inside the
  repository was enumerated during the original investigation and none breaks: `kit-smoke.ts:45-47` and
  `examples/hello-card/build.js:9-19` both pass freshly created boards, and
  `kit.test.ts` calls `flush()` bare or with `timeoutMs` only. The owner's own
  scripts are the remaining unknown, and the answer decides A1 versus A2 in
  *Alternatives*.
* **Q-M — In the family that passed a real root, did the deadline go to the
  script's flush or to penpair's post-write settle?** Re-running on HEAD with the
  flush return value kept answers it, because the per-phase split is now in the
  output.

Q-F, the shape-level layout-wait capability, is no longer an open question
blocking anything — `layout-policy.ts:19` already branches on
`shape.waitForLayoutUpdate` and prefers per-shape native waits when every root
supplies it. Work 3 records which pinned versions do.

## Sequence

Delivered in this update:

1. Generate canonical sandbox source from `layout-settling.ts`, with explicit
   regeneration and a build/prepack freshness check. The host keeps its ordinary
   imported function; no runtime compiler or `Function.toString()` is needed.
2. Implement A1 before the flush flag and both layout calls. Keep one shared
   deadline, page scope when the key is absent, and queue recovery after refusal.
3. Retain Work 2 in `@instances`, add the shape probe and doctor qualification,
   and return actual flush metrics from the hello-card example.
4. Update guides and automated coverage, including installed-package checks.

Remaining live phase:

1. Record Work 3's capability results against both pinned Penpot versions.
2. Run the adjacent [Q-SELF probe](penpot-revision-conflicts.md#q-self--the-probe-that-gates-everything)
   on scratch and G6's scoped/page measurements with equivalent starting states.
3. Run G7's acceptance workload and update both designs from the results.

The [live-verification checklist](../layout-settling.md#pending-live-verification)
records evidence and recovery requirements. These probes are separate from local
implementation; no revision-guard relaxation is included.

## Measurement

The example build script now keeps the flush return value, following the pattern
in `kit-smoke.ts`:

```js
const settled = await pp.flush({ root });
return { ok: true, rootId: root.id, layout: settled.layout,
         phases: settled.phases, slowest: settled.slowest };
```

Then build one heavy board twice, run A with `pp.flush()` and run B with
`pp.flush({ root })`:

```sh
penpair run-file <build> --inspect <inspect> --readback <readback> \
  --page <page> --stages 7 --apply --trace
```

`--layout-scope inspected` is already the default and does not need passing.
Read `penpair runs RUN_ID` for the per-stage settle elapsed times before and
after the write, `layout.rootIds`, `nodeCount`, `truncated`, `method`, the
per-phase `flush` split and `slowest`. The traced inspect window brackets the
inspect snippet, the settle and the readback snippet, so subtracting the settle
elapsed time leaves two snippet executions plus transport, not transport alone.

```text
  layout-before dominates       ─▶ the before-settle is the cost. Re-open the
                                   settle question with this figure.
  layout-after dominates        ─▶ Penpot is recomputing after the write. The
                                   lever is a smaller nodeCount or fewer shapes
                                   per stage, not a flush change.
  binds dominates, slowest      ─▶ STOP. The cost is applyToken round trips,
  naming one component             which this design does not address. Re-scope.
  rootIds is the page root id,  ─▶ the script was flushing the whole page.
  nodeCount 10000, truncated       Work 1 is the whole fix; close the settle
  true, method "partial"           question.
  no phase dominates, or        ─▶ close the settle question as documentation.
  both runs land in budget         This is the expected outcome after Work 1.
```

Record the figures in `docs/layout-settling.md` alongside the recipe, so a third
party can check them.

Alongside it, convert the next build to a `penpair queue run` spec and read
per-job `elapsedMs` from `queue status` (`queue.ts:47`), and run
`penpair repair --page P --empty-shapes` to see whether HEAD's detector finds the
three empty shapes the session's own `remove()` missed.

## Work 1 — remove the masked fallback

Implemented using the selected A1 contract:

- An explicitly supplied falsy `root` refuses with `Flush root must exist (got
  VALUE)`. Strings are quoted and values such as `undefined` and `NaN` remain
  legible. Validation runs before `flushing = true`, layout or queued work.
- Both layout calls forward `options.root` without the page-root substitution.
  Missing keys still use `settle`'s page-root default. Each call retains
  `{ timeoutMs: remaining(), strategy: options.strategy }`, so the before/after
  phases and token bindings share the original flush deadline.
- A rejection preserves queued styles/bindings and does not leave the
  concurrency flag set; a later corrected call can proceed.
- Valid root arrays remain supported. Empty arrays and arrays containing missing
  shapes fail in layout validation. Direct `pp.settle(undefined)` keeps its
  separate default.

The initial implementation attempt did not fit the built budget. The prerequisite
is now delivered: a generator extracts the same host function through the
TypeScript AST and pinned esbuild produces stable JavaScript text. The generated
module is tracked; core builds check its freshness without rewriting it. Current
size figures are recorded in Status and the [kit guide](../build-kit.md).

## Work 2 — filter cardinality guard

Implemented in `@instances`, after `@kit`:

- `pp.find(root, filter, expected = 1)` requires a root and a positive integer
  `expected`; the root itself and its descendants participate in the search.
- A string filter matches `shape.name`; a function is used as the predicate.
  Error labels use the function name, or `predicate` for an anonymous function.
- The shared traversal refuses above 20,000 nodes. A count different from
  `expected` throws an error naming the filter, observed count, root and expected
  count. One expected match returns a shape; larger counts return an array.

The `@instances` source remains below 7 KiB in this update. It was placed here because
`@kit` had only 20 bytes of built headroom at the baseline; this update retains
that placement for compatibility. `loadKits` defaults to
`["@kit"]`, so authors must explicitly include `@instances` and use `pp.find` to
receive the selector-level guard. Flush now independently refuses explicit
empty roots whether or not the helper is used.

## Work 3 — record the capability

Implemented: `shapeApis.layoutWait` reports
`typeof shape.waitForLayoutUpdate` in `probe.ts`. The new fixture includes a
small shape with an export method; the empty-page fixture remains covered.

Record the result for both pinned Penpot versions in `docs/compatibility.md`.
Switching versions touches the pin, so run the smoke test before bumping
(`AGENTS.md:39`).

## Work 4 — `doctor` output

**Decided, because the test asserts it:** mark the transport row
`warning: true` when the editor verdict fails, rather than suppressing it.
`DoctorCheck.warning` already exists (`instance/connection.ts:29`) and
`cli-main.ts:1855` already renders it as `WARN`, while the exit code comes from
`all.every((check) => check.ok)` at `:1837` — so a warning qualifies a row
without changing exit codes.

The transport row is pushed from the `onTransport` callback during `connect`,
before the verdict exists, so the implemented catch path updates the
row already in `out`, extending the existing failed-transport branch.

The tab census now emits `ok: true, warning: true` with a remedy when doctor
runs without `--debug-port`. Unrelated commands still receive no browser-tabs
row. A CLI regression test covers both passing and failing editor verdicts. `ok: false` here would make
every `doctor` run without `--debug-port` exit non-zero; `ok: true` alone would
reintroduce the defect this work exists to fix.

## Work 5 — documentation

Implemented documentation changes:

* **`build-flow.md`** teaches scoped flushes, `pp.find` and the stage/queue
  routing at the point where an agent writes a snippet. The skill remains neutral.
* **`docs/build-kit.md`** records the helper contract, explicit-root refusal
  and generated-source budgets.
* **`docs/layout-settling.md`** describes the available repair command, scoped
  flushes, partial evidence and empty-root refusal.
* **`docs/run-file.md` and `docs/queue.md`** link the two workflows and explain
  that a queue job can itself contain stages.
* **`docs/mcp.md`** records the `run_registered` flag limitation.

The flush contract now describes refusal. Pending live capability results belong in
`docs/compatibility.md`; measured heavy-board results belong in
`docs/layout-settling.md`. Neither has been collected for this update.

## Constraints and preconditions

* **Kit byte ceilings, already measured.** 32 KiB per source (`kit.ts:86-88`) and
  48 KiB combined (`:134-136`), under the 90 KB snippet limit (`client.ts:38`).
  The current generated sizes are recorded in Status. Source, built-consumer
  and installed-package checks all enforce the same text and existing ceilings. **The per-source figure is `sources[].bytes`, not the top-level `bytes`,
  which is the combined wrapped number.** To read both:
  `penpair kit check --include @kit --include @instances`. Once a source is over
  budget `loadKits` throws (`kit.ts:197-200`) before `kit check` can print, so
  the figure is only readable while still under.
* **Neutral core.** Runtime changes belong to `packages/core`; generation and
  consumer checks belong to repository tooling.
  `neutrality.test.ts` scans both `src` and `skills` for project names
  (`AGENTS.md:35`). The new helper's name, its throw message and Work 5's routing
  prose must all stay project-free.
* **Biome does not format inside `String.raw`**
  (`docs/conventions/README.md:55-57`), so `pnpm format` gives no signal on Work
  1's or Work 2's snippet code. Follow `docs/conventions/plugin-code.md` for
  in-string style.
* **Settle budgets.** The flush default is 10,000 ms and 30,000 ms is the
  refusal ceiling (`kit-source.ts:235-238`).
* **Write protocol.** Every Penpot-touching verification follows read-only
  inspect, pinned snapshot, one idempotent write, independent readback, and an
  export that is looked at — twice, since a first export after a write or a page
  switch can be stale (`AGENTS.md:37`).
* **Owner go-ahead for non-scratch writes.** G6 uses `--apply` against real
  design work (`AGENTS.md:16`). Name the file and record the go-ahead first.
* **Secrets.** The MCP URL carries a personal key. No probe output, journal
  excerpt or measurement figure may reproduce it.
* **Release.** All six packages release together at one version, and no version
  is bumped by hand. Work 1 changes observable behaviour of a shipped snippet
  API, so it needs a changeset in the same change.

## Risks and mitigations

* **Work 1 changes behaviour of a shipped snippet API.** A script outside this
  repository passing a possibly-falsy root and relying on the fallback starts
  throwing. *Mitigation:* the minor release note explains migration: omit the
  key for intentional page scope or supply a verified root. A1 is selected.
* **`pp.settle(undefined)` still page-settles.** Work 1 changes `flush` only, so
  the hole described in *The Problem* is narrowed, not closed.
  `pp.settle(null)` already refuses through `layout-policy.ts:8`; only
  `undefined` falls through the default parameter. *Mitigation:* Work 5 documents
  the asymmetry in `docs/build-kit.md` so the two rows do not contradict each
  other.
* **A widened scope is still illegible on the failure path.** `detail()` does not
  name root ids. *Mitigation:* naming root IDs in errors remains outside this change; inspect
  the journal scope and successful flush report.
* **Work 2's helper is opt-in twice over** — select `@instances`, then call it.
  *Mitigation:* Work 1 now refuses the explicit empty root independently;
  `pp.find` adds the earlier selector-specific error.
* **The measurement may invalidate this design's framing.** A `binds`-dominant
  verdict means the cost is `applyToken` round trips, which nothing here
  addresses. *Mitigation:* that verdict says STOP and re-scope.

## Alternatives

### The flush scope policy — A1 selected

* **A1, refuse (selected and implemented).** Remove the fallback and refuse an
  explicit falsy `root`. Canonical generation provides measured headroom. Callers
  relying on substitution must migrate as documented.
  Note that this is a *new* policy, not consistency with host behaviour:
  `docs/layout-settling.md:25` refuses root ids that do not exist, and the same
  sentence states that without explicit roots the current page is sampled.
* **A2, report and warn.** Keep the fallback and warn when the scope widened.
  Cheaper than it looks: `settleLayout`'s result already carries `rootIds`,
  `nodeCount`, `truncated` and `method` (`layout-settling.ts:91-118`) and `flush`
  already returns it as `layout` (`kit-source.ts:276`), so only the warning is
  new. Breaks nobody. *Weaker because* a warning in a successful run is routinely
  unread, and the field failure was a timeout a warning would not have prevented.
* **A3, explicit opt-in to page scope.** Require `root: "page"`; absent and falsy
  both refuse. *Rejected because* it breaks every caller that omits `root`, a
  larger break than A1 for the same benefit.

Rejections for work outside this design are recorded in the Non-Goals above,
each with its reason.

## Implementation

Works 1–5 and G6's example reporting are implemented. G6's live measurement
and G7's acceptance workload remain pending. The changeset covers the delivered
root policy, generated source, helper, probe and doctor changes.

* **`packages/core/src/kit-source.ts` — Work 1.** Removed the two
  `|| penpot.currentPage.root` substitutions; added the explicit-`undefined`
  refusal before `flushing = true`.
* **`packages/core/src/kit-instances.ts` — Work 2.** Added the resolve-by-filter
  helper to the `@instances` source and register it on the returned object.
  The implemented signature and message contract are recorded in *Work 2*.
* **`packages/core/src/probe.ts` — Work 3.** Reports
  `typeof shape.waitForLayoutUpdate` in `shapeApis`.
* **`packages/core/src/instance/connection.ts` — Work 4.** Marks the transport row
  `warning: true` when the editor verdict fails, extending the `:221-230` path.
* **`packages/core/src/cli-main.ts` — Work 4.** Emits the skipped tab census as
  `ok: true, warning: true` with a remedy.
* **`examples/hello-card/build.js` — G6.** Retains the flush result and returns
  its layout, phases and slowest binding, per *Measurement*. Nothing else consumes the result:
  `readback.js:3` recomputes independently and `run-file.ts:254` tolerates extra
  keys.
* **`.changeset/<name>.md` — Work 1.** Minor bump, describing the refusal and
  what a caller relying on the old substitution must do instead. Must land with
  Work 1.
* **Work 5 documentation** — the five files listed in *Work 5*, plus
  `docs/compatibility.md` for Work 3's result.

### Coverage and remaining tests

The cases below accompany the implementation; they do not establish live
Penpot compatibility or performance.

* `packages/core/test/kit.test.ts` — `flush({ root: <falsy> })` refuses and names
  the key and the value, for `undefined`, `null`, `0`, `""` and `false`;
  `flush({})` still settles the page; `kit.test.ts:268-301` still asserts the
  deadline fires in `binds`.
* `packages/core/test/kit-instances.test.ts` — cardinality cases for zero, one
  and many matches, asserting the throw names the filter and the count.
* `packages/core/test/probe.test.ts` — a fixture with one shape, asserting
  `shapeApis` reports `layoutWait`.
* `packages/core/test/doctor-readiness.test.ts` — a failing editor verdict marks
  the transport row `warning`; a run without `--debug-port` emits the tab-census
  warning and its exit code is unchanged.
* `packages/core/test/kit-integration.test.ts` — checks actual example flush
  report fields while preserving repeated-build IDs, and drives
  `runKitSmoke` against sandbox fixtures. This is not a live Penpot trial and
  does not exercise `pp.find`, which belongs to `@instances`. `kit-smoke.ts:45-47` always passes a freshly created board, so Work 1
  does not change its behaviour.

### Verification

* **Install.** Run `pnpm install --frozen-lockfile`.
* **Before any snippet edit.** Run
  `penpair kit check --include @kit --include @instances` and record
  `sources[].bytes` for each kit. Proceed only if the complete proposed sources fit their per-source and combined ceilings in
  built consumers as well as core tests; stop otherwise.
* **Static and build.** After a policy edit run `pnpm sandbox:generate`, then
  `pnpm format` and `pnpm check`. All must pass;
  `pnpm check` runs the unit cases above and the version check.
* **Package.** Run `pnpm smoke:package` for installed kit byte/hash identity,
  existing budgets and the same empty/omitted-root contract.
* **Capability.** A maintainer runs `penpair probe` against Penpot 2.18.3 and
  2.18.4 and records each result in `docs/compatibility.md`.
* **Measurement.** The owner names the target file, records the go-ahead for the
  `--apply` writes, runs the two runs in *Measurement* on HEAD, and writes the
  figures into `docs/layout-settling.md`.
* **Acceptance.** The owner runs a workload of the same board and instance count
  as the field session and confirms no build is wasted by a filter or scope
  defect, and drives one heavy build from `build-flow.md` alone.
