# Penpot revision conflicts

Why journaled runs abort when nothing has been written, and what could be done
about it. **Status: not ready to build.** One probe decides whether penpair needs
any change at all, and that probe has not run. Nothing here is built until it
does — including the kit guard this design expects to need, which is a code
change like any other and is scoped below.

The adjacent design,
[Fewer lost penpair runs](./fewer-lost-penpair-runs.md), has local implementation and automated coverage, including
flush-root refusal and stable sandbox generation. Its remaining live-work
[sequence](fewer-lost-penpair-runs.md#sequence) includes Q-SELF alongside the
other probes.

Baseline: Penpair 0.6.0 (`961cc52`). Field-session counts below are reported
observations from 0.5.0, not independently reproduced measurements.

## The observation

A session driving penpair against a live Penpot file lost runs to revision
conflicts without any write taking place. Counted from its output: at least 8
runs ended with *"File revision changed during step inspection"*
(`journal.ts:465-468`) and at least 7 with *"File changed while planning; inspect
again before starting a run"* (`journal.ts:310-315`). No surviving message names
*"File revision changed after inspection; no step was replayed"*
(`journal.ts:507-511`). Both counts are lower bounds: at least five further
failures printed only an outcome, with the message filtered out of the output.

The session ran penpair 0.5.0, so any re-measurement must run on HEAD to be
comparable.

## Why this is not yet a design

The aborts have three candidate causes, and they call for three different
responses:

1. **The run moves the revision itself.** The session's scripts set
   `penpot.selection` and zoomed the viewport in the same debug tab during runs.
   If either mutates the file, the run invalidates its own baseline and the
   remedy is a constraint on what inspect and apply snippets may touch — no
   penpair code at all.
2. **A human moved it.** Whether the owner was editing or merely viewing during
   the conflicts is unknown and not determinable from the agent's side.
3. **penpair's own machinery moved it.** Investigated and ruled out for the
   observed aborts; see *What the lease does not explain*.

Until cause 1 is tested, any journal change risks fixing a self-inflicted problem
in the wrong layer.

## Q-SELF — the probe that gates everything

**Owner: the project owner**, alongside the probes in the adjacent design.
No revision-guard implementation proceeds until this probe reports.

On a scratch Penpot file only, since it mutates (`AGENTS.md:16`):

```text
read   penpot.currentFile.revn                        → r0
set    penpot.selection = [oneShape]    → read revn   → r1
zoom   the viewport                     → read revn   → r2
```

Specify before running: the snippet that carries it, how it is invoked, the
scratch file, and which shape is selected. Allow for delayed revision updates:
record the observation window and repeat revision reads after each action before
concluding that it did not move. A negative result is limited to that window.

* **If `r1` or `r2` moved** — a run must not touch selection or the viewport
  between capturing its baseline and completing its steps. The deliverable is
  that constraint, stated in
  `packages/core/skills/penpair-recipes/references/build-flow.md`, optionally
  enforced by a kit guard that refuses selection changes inside an inspect
  snippet. **No change to `journal.ts`.** This is the outcome this design expects.

  A kit guard is not free: it lands inside the `String.raw` source in
  `kit-source.ts` and is weighed against the 32 KiB per-source and 48 KiB
  combined ceilings (`kit.ts:86-88`, `:134-136`) that the adjacent design
  now checks against canonical generated source. Any new guard still requires
  consumer-side byte checks; it is not included in this update.
* **If neither moved** — neither tested action changed the revision within the
  observation window. This does not identify the cause of the historical aborts
  or prove a human caused them. Reproduce and trace a conflict on the baseline
  before choosing among the options below.

A caveat that bounds what the probe can deliver: it tests whether a mechanism
exists. It cannot attribute the 15 observed aborts, which is why a positive
result does not prove the conflicts were wholly self-inflicted, and why the
decision rule for a partial answer has to be written before it runs.

## What the lease does not explain

Acquiring the writer lease writes
`setSharedPluginData("penpair", "writer", …)` (`coordination.ts:282`), which is a
file mutation, so it looked like a candidate cause. It is not, for the observed
aborts. Tracing `journal.ts`: the baseline target is read at `:262`, every step
is inspected at `:305-307`, the planning comparison runs at `:309-315`, the
record is persisted at `:381`, and **the lease is acquired at `:430`** — after
the planning comparison and before the per-step reads at `:460` and `:464` that
`:465` compares. Any revision bump it causes therefore falls in neither compared
window. `lease.check()` is effect `"read"`, and the release is at the end.

Capturing the baseline after the lease would also change nothing:
`record.target.revision` is consumed only at `:310-312`, which has already run by
then, and `assertTarget` (`:419-426`) compares `fileId` only.

## What `journal.ts:465` actually defends

This matters because it determines whether any relaxation is safe.

It is not write safety. The mutation carries its own in-snippet revision
precondition (`coordination.ts:348`, applied at `operation.ts:443`), and there is
a second host-side gate at `journal.ts:507-511`.

What `:465` defends is **snapshot coherence of `current`** — the inspection
object passed to `step.apply(current, …)` at `journal.ts:512`. `step.inspect()`
is three round trips: the inspect snippet, a settle, and the readback snippet
(`operation.ts:371`, `:375`, `:379`). If the file moves mid-window, `current` can
be a torn read mixing pre- and post-edit state.

The content comparison often proposed as the replacement cannot detect that.
`operation.ts:473-476` compares `observationHash(before.inspection)` against
`observationHash(current.inspection)`, and `observationHash`
(`journal.ts:127-148`) filters only the `execution` key — so it hashes whatever
**the project's own inspect snippet** chose to report. A torn read can hash-match
on reported fields while being torn on unreported ones, and a human edit to
anything the inspect script does not report hashes equal and lets the run
proceed. `operation.reconcile` is also project-supplied and is consulted first
(`operation.ts:466-472`).

So substituting the content hash for `:465` is a **relaxation, not a reorder**:
it trades engine-enforced coherence for project-declared coherence. With `revn`
file-global and no compare-and-swap anywhere in this codebase
(`coordination.ts:337`), a conservative file-global check is the only sound
engine *default*.

## The coupling worth keeping in mind

A settle runs inside both compared windows. The planning window
(`:305-307` to `:309`) contains `step.inspect()` for every step, and the per-step
window (`:460` to `:464`) contains one. `step.inspect()` settles at
`operation.ts:375`. So a long settle widens the exposure in both places, and
shortening it reduces conflicts without touching a guard — which is part of why
the flush scope work in the adjacent design comes first and may reduce these
counts on its own.

At HEAD, `--layout-scope inspected` is the default and can make that settle free
when the inspect script names no `layoutRoots` (`operation.ts:307-317`). The
field session ran 0.5.0, which had no `--layout-scope`, so its windows did
contain whole-page settles.

## Options, if the probe comes back clean

Not ranked. Each needs the owner's decision, and none should be built before
Q-SELF reports.

* **Extend the `reconcile` contract.** Pass a drift signal into
  `JournalStep.reconcile`, which has no such parameter today, and let each step
  decide — strict by default. Keeps the engine's conservative default while
  letting an operation opt into content comparison. Larger change; preserves the
  ability of future adapter operations to be strict, which a removal would
  destroy permanently.
* **Content comparison at the two observed abort points.** Record the drift at
  `:310-315` and `:465-468` and fall through to the content comparison. Note that
  `:310-315` runs before `persist(true)` at `:381`, so planning-time drift has no
  record to attach to and must re-observe before any journal state exists — and
  that re-observe re-inspects every step, including its settle. Also note that
  relaxing `:465` moves runs into `:507-511`, which has no content comparison at
  all, so "never fired" there is selection bias rather than evidence.
* **Narrow the windows only.** Shorten the settle, change no guard, re-count.
  Cannot help the planning aborts beyond what settle scoping gives, and leaves
  the asymmetry in place.

Whatever is chosen, these stay: the in-snippet precondition at
`coordination.ts:348`; the pre-apply gate at `journal.ts:507-511`; no auto-retry
of the `started` or uncertain branch (`journal.ts:523-527`).

## Constraints any option must respect

* **Retry must be specified, not implied.** Attempt bound, terminal state, and
  whether that state is `conflict` or `uncertain`. Each re-inspect re-runs a
  settle, so against a live editor an unbounded retry is a livelock.
* **The lease cannot be renewed.** `WriteLease` (`coordination.ts:13-20`) exposes
  `check` and `release` only, and `expiresAt` is fixed at `createdAt` plus 15
  minutes (`:245`). Retry plus staged settles must fit inside that, and
  `--stages` accepts up to 50. Do the arithmetic before committing, or add
  renewal as an explicit prerequisite.
* **Pinning a subtree hash in `JournalTarget` is out of scope here.** `revn` is a
  file-global integer everywhere the journal uses it, so replacing the pin is a
  persisted-schema change with a migration story for every outstanding journal.
* **A per-subtree generation counter in shared plugin data is rejected
  outright.** A human editing in the Penpot UI would not bump it, so it would
  report "unchanged" for exactly the case the guard exists to catch. Named here
  so it is not re-proposed.
* **Touching the settle path invalidates outstanding journals.** `planHash`
  includes `settleOperation.toString()`. `journal.ts:293` already refuses any
  resume across an `engineVersion` change and all six packages release at one
  version, so a released change trips that first — but a reader resuming across a
  local rebuild would see a plan mismatch.

## Open questions

* **Q-SELF** — above. Gates everything.
* **Q-WHO** — of the observed conflicts, how many had the owner editing rather
  than merely viewing? Not answerable from the agent's side; needs a deliberate
  experiment with the owner's participation.
* **Q-API** — does any Penpot API report what changed in a revision? If not,
  content hashing plus bounded retry is the ceiling on what any option can
  achieve.
* **Q-COUNT** — re-counted on HEAD after the flush scope work lands, how many
  aborts remain? If the count collapses, this design closes without shipping.
