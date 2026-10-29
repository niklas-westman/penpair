# Discover commands and keep capture progress visible

The installed CLI is the reference for the version actually in use. Read help
before an unfamiliar operation; commands below are offline and do not import
project adapters or connect to Penpot, even with malformed project configuration.

```sh
pnpm exec penpair --help
pnpm exec penpair help --all
pnpm exec penpair export --help
pnpm exec penpair help export batch
pnpm exec penpair --help --help-id export.batch
pnpm exec penpair help --search progress
pnpm exec penpair help export batch --json
```

Space-separated paths and dot IDs resolve the same topics. `--help-id` is the
explicit lookup flag; there is no `--help-subtask` alias. JSON help lives in
`CommandResult.data`, retaining CommandResult schemaVersion 1. Unknown IDs fail
with discovery instructions. `--all` includes every core action and known adapter
topic. A configured adapter without static metadata is marked unavailable; its
command coverage is unknown until its own documentation is consulted.

Use `workflows.iterative-build` to build and visually critique one representative
frame before expanding. Use scoped `pp.flush({ root: shape })`; omit `root` only
when a whole-page flush is intended. Read `run-file.stages` and `queue.recovery`
before a large staged build or resuming uncertain work. Changed script hashes may
prevent old journals from resuming; keep revision and target protections intact.

Use `workflows.capture-evidence` to choose between one export, a batch, shots and
baselines. An ad-hoc `export --cache` fingerprint may miss font/image payload or
external render changes: a hit is **cached**, never freshly captured pixel proof.
Baseline capture renders anew and uses lossless WebP for new references, retaining
existing formats until explicit migration. A captured or staged file does not
imply publication, verification or owner approval.

## Progress and final output

`export` (ID, name or batch), `shots`, `baselines` and `design-release copy` accept
`--progress human|json|off`. Human progress is the default. All progress goes to
stderr; `--json` controls the one final CommandResult on stdout independently.
Progress is not copied into final warnings. Existing library `onStep` callbacks
remain available; `onProgress` adds structured phase events without requiring a
CLI or altering capture outcomes.

JSON progress has `schemaVersion: 1`, `kind: "progress"`, `command`, `phase`,
`status` and phase-local `elapsedMs`; `frame`, `index`, `total` appear when known.
Phases report actual selection, fingerprint/cache, render, layout, stability,
encoding, verification, staging and publication work. Waiting events repeat every
five seconds while a phase is pending. Timers stop on completion or cancellation;
events do not add retries, percentages or approval claims.

Release copy reports source preparation before the write journal starts, including
run ID and per-frame index/total, measured elapsed time and five-second waiting
events. The observed frame name is shown once known. Preparation can take time
collecting stable source images before any paste; a lack of pasted boards does
not by itself mean this phase stalled. Journal notifications use phase `journal`,
status `info` and command elapsed time. An early preparation ID is not evidence
of a journal or a dispatched paste: resume only an existing reviewed journal,
after independently inspecting the destination. This release adds visibility,
not a throughput guarantee or additional mutation retries.

For a one-off release transfer, guided manual native copy/paste remains an option
while automated throughput is unverified. Record explicit source/target IDs and
verify native fields and pixels regardless of transfer method.

Run in the foreground. To retain a readable log:

```sh
set -o pipefail
pnpm exec penpair export --frames ID=representative --page PAGE --out design/exports \
  --progress human --json 2>&1 | tee export.log
```

For machine consumers, keep the streams separate: inherit stderr and capture
stdout, then parse the **entire** stdout JSON, require process exit 0 and check
outcome/completeness. Never concatenate stderr into JSON. `2>&1 | tail -40` holds
output until the process ends and can conceal command failure without pipefail.
Counting files is not a publication or success check.

On an older CLI, start with its actual `--help` and command help; omit unsupported
help IDs and progress flags. Existing default stderr messages can still be streamed
by fixing the wrapper. Do not fetch a global CLI in place of the installed version.

## Maintaining discovery

Core argument definitions and action flags are shared by execution and help.
Keep descriptions, examples, workflow IDs and related topics current when adding
behavior. First-party adapter packages declare a relative `penpair.help` JSON
manifest in package.json and include it in their packed files. Schema 1 manifests
contain `topics` with ID, summary, usages, typed flags, instructions and related
IDs. Discovery validates bounded static JSON inside the package and never imports
its JavaScript entrypoint. Keep adapter help vocabulary aligned with its parser.

Validation includes offline/malformed-config help, adapter side effects, phase
timers/redaction, unchanged capture guards, and packed-package discovery. Live
Penpot timing and visual evidence remain a separate verification phase.
