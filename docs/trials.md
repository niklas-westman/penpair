# Human trial runbook (I12)

Status: prepared, **not run**. Niklas asked to finish branch code and leave live trials pending (2026-10-21). Offline fixtures exercise control flow, not people, real servers, visual parity or adoption. Keep I12 unchecked until two actual people complete the exercises and review one real design-to-code route.

## Preparation

Use two consenting people with separate fresh project folders, personal connections and independently owned credentials. The owner must explicitly authorize two disposable Penpot files and identify their public file/page IDs. Never infer authorization from a file name. Keep the editor visible. No telemetry runs in the background.

Record commit, tarball SHA-256 hashes, package versions, OS, Node/package manager, actual agent client, Penpot deployment and observed API version in [report-template.json](trials/report-template.json). This branch still reports 0.1.3: the version alone cannot distinguish it from the registry release. Use a reviewed release or pack the complete branch package set. When installing command/adapter tarballs, override `@penpair/core` to the matching local core tarball, as `scripts/smoke-package.mjs` does. Installing only the web tarball may silently resolve an older registry core.

Start the clock before setup. Each person enters their own secret through the documented hidden connection flow; never collect the key in a report, shell transcript or screenshot. Run onboarding and `doctor --json`, then configure the owner-confirmed file pin. Record interventions and exact understandable or confusing failures, with credentials redacted.

Preview `penpair skills install --dry-run` before installation. Test discovery separately in each actual agent client. Codex scans repository `.agents/skills` from the current folder to the repository root and supports symlinked skill folders; check the skill selector and invoke the skill explicitly before assessing automatic discovery. See [official skill documentation](https://learn.chatgpt.com/docs/build-skills). Record the actual installed path, client version and observed discovery; do not generalize one client's result to another.

## Exercises

1. Build a small card using the [reviewed Hello-card example](../examples/hello-card/README.md), or use `probe --deep --kit --write` on an authorized scratch file with active typed tokens and an available font. Inspect the private preview. Record eligible/bound token counts with the inspected population and whether traversal was complete. The probe removes its temporary root; any persistent example needs an explicit owner-reviewed cleanup.
2. Pin file A, open disposable file B, and run `examples/trials/wrong-file-read.js` through `run-file` without a page argument. Expect a file-guard refusal before the body. Basic `pages` inspection only warns by design, so it is not the hard-block exercise. Restore A afterward.
3. Use a dedicated empty page in A. Copy `examples/trials` into each scratch project. Person A runs the holder below with a fresh marker. Person B attempts the same operation from their own project/key with a different fresh marker while A is writing. Record refusal during the lease, server serialization, overlap, unsupported API or unknown, and timings. Same-checkout tests only prove a local lock; they do not prove cross-client atomic exclusion. A busy attempt can have an uncertain journal even before applying: inspect the recorded steps and retain the actual diagnostic.
4. Run the recovery example below with `failAfterWrite=true`. It deliberately throws after creating a small owned frame. Record the uncertain run ID and frame ID. Use **the same files and parameters** with explicit `--resume RUN_ID`; independent readback must reconcile the existing frame without a duplicate. Export twice, look at the image, and record the result. A fresh run is not recovery. A renamed/duplicated marker or changed source requires inspection rather than an automatic retry.
5. Exercise one real implementation route through existing baselines and the Reflection handoff. Obtain explicit frame approval; hold fonts and fixture data stable. Record actual browser comparison and adoption findings. Rich coverage cases require the D4 hooks and cannot be represented as successful default-state checks. Human adoption remains a gate before declaring the C1/D1/E1 expansion accepted.

```sh
penpair run-file examples/trials/hold-writer.js \
  --inspect examples/trials/hold-inspect.js --readback examples/trials/hold-readback.js \
  --param fileId=OWNER_CONFIRMED_FILE --param pageId=OWNER_CONFIRMED_EMPTY_PAGE \
  --param marker=FRESH_PERSON_A_MARKER --param holdMs=30000 \
  --apply --timeout-ms 45000

penpair run-file examples/trials/recovery-build.js \
  --inspect examples/trials/recovery-inspect.js --readback examples/trials/recovery-readback.js \
  --param fileId=OWNER_CONFIRMED_FILE --param pageId=OWNER_CONFIRMED_PAGE \
  --param name=RecoveryTrial --param marker=FRESH_RECOVERY_MARKER \
  --param failAfterWrite=true --apply
```

The holder intentionally waits to create a contention window; it is not layout settling. It creates no design nodes but records a `penpair/trial-hold-MARKER` file metadata record with holding/complete state. A partial marker is evidence requiring inspection. A completed marker makes the same operation a verified no-op; use a fresh marker for each new contention exercise. The recovery example leaves an owned frame intentionally. Remove only explicitly confirmed owned IDs/markers with a reviewed operation, or let the owner discard the dedicated scratch files.

## Evidence and completion

Copy the template under ignored `.penpair/trials/`. Unobserved metrics remain null, not zero. Record time to doctor-green, human interventions, failure comprehension, binding coverage, independent verified outcomes, visual review, blockers and resulting backlog changes. Capture screenshots only after closing secret-entry panels. Commit only owner-reviewed redacted summaries, never keys, raw connection transcripts or private journals. There is no completed human report yet.
