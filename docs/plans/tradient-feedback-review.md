# Adoption feedback branch review

Date: 2026-10-22. Branch: `codex/tradient-feedback`. Base: `57f9782`.

Code phases 0–6 are implemented and verified. The branch is ready for owner review. Live Penpot acceptance remains pending; the lease/save race is investigated rather than claimed fixed. No version bump, push, PR, merge or publication was performed. All six repository versions remain 0.2.0.

## What each update resolves

| Finding | Delivered result | Verification and limit |
| --- | --- | --- |
| PP-01: native layout timeout blocks default build | Shared bounded auto/native/geometry policy for SDK and kit; CLI selection; three complete matching geometry/hierarchy samples | Native success/failure/hang, transport/cancellation/malformed/target refusal and independent matching exports tested; real Penpot build pending |
| PP-02: unexplained metadata-only token drift | Stable reason codes and explicit existing ownership migration guidance | Legacy values unchanged while schema/hash differs reproduces and explains staleness; migration preserves provenance |
| PP-03: readiness is unclear | Bounded origin, transport, fresh execution challenge, file/page identity and file-pin evidence | Sleeping origin/editor, stale/malformed challenge, wrong pin and redaction tested; real editor state trials pending |
| PP-04: simultaneous theme preview needs custom glue | Offline versioned projection, shared ordered alias resolver, adapter command and owned-root example | Precedence, composites, unknowns and sandbox preservation tested; native frame themes remain unproved |
| PP-05: real comparison provider is missing | Packaged browser starter with project hooks, actual state/fonts, pointer, occlusion and crop evidence | Eight real local Chromium cases, delayed fonts and six rejection cases; unapproved synthetic references do not establish Penpot parity |
| PP-06: workflow/companions are hard to discover | Companion setup guide, grouped installed help and first-frame composition checklist | Help, docs, core neutrality and idempotent installed skills tested; composition still requires judgment |
| PP-07: suspected self-save revision conflict | Optional redacted lease/inspection/revision traces and conservative reproducer | **Unresolved causality.** Own delayed persistence and external edits still conflict; no revision guard was relaxed |
| PP-08: multi-page snapshots fail | Observed page-ID polling, serialized sessions, per-page progress and starting-page restoration | Delayed/concurrent collectors, manual navigation, source edits and restoration failures tested; real multi-page trial pending |

The final review also reproduced and fixed cancellation allowing a third collector to bypass an active session. Queue order now survives cancellation. Layout and doctor reject malformed evidence, and browser frame sampling has a deadline.

## Validation

- `pnpm check`: **630 tests** pass (core 498, Docker 28, token adapter 99, comparison adapter 5), build/typecheck and six-package version guard pass.
- `pnpm smoke:package`: all **six tarballs** install and run in clean consumers. Installed help, skills, adapter documentation and browser starter are verified.
- Real browser trial: bundled Playwright **1.62.1**, cached Chromium **148.0.7778.96**; desktop/mobile × light/dark × loaded/empty. Missing/wrong font face/weight, wrong theme, scale mismatch, hover contamination and sticky occlusion refuse; delayed font loading succeeds. Baseline bytes remain unchanged and verdict stays `owner-review-required`.
- Actual captures were visually inspected. That inspection found a sticky header hiding the heading; an occlusion guard and explicit project scroll hook corrected it. [Portable evidence](../fixtures/browser-capture-2026-10-22.json) records the cases without machine paths or credentials.
- `git diff --check` passes. Changesets cover fixes and new public capabilities; repository versions are unchanged.

## Commits

| Step | Commit |
| --- | --- |
| Baseline/reproductions | `cc65514` |
| Bounded layout | `2c60ac5` |
| Migration/readiness | `b985dc2` |
| Coordination/snapshots | `b51ad30` |
| Help/composition | `81f20d3` |
| Browser starter | `79e8c8e` |
| Projected themes | `415b291` |
| Final boundary fixes | `5bcc687` |

## Remaining acceptance

- [ ] Owner reviews the branch and authorizes any push/PR or release work.
- [ ] Owner confirms a disposable Penpot copy by public file ID; populate the [scratch manifest](../fixtures/feedback-scratch.template.json). No credentials belong in it.
- [ ] Run shipped CLI/kit build, repeat it and change one heading across the eight cases; independently compare IDs, bindings, geometry and two inspected exports.
- [ ] Verify fresh doctor reads with responsive/background/disconnected scratch editor states.
- [ ] Capture idle/no-op and controlled external-edit traces; establish PP-07 causality before reviewing a revision-order change.
- [ ] Run a two-page snapshot with restoration and projected-color preservation checks for global selections, catalog/order and unrelated objects.
- [ ] Prove any native frame-theme or component override capability separately; projected appearance is insufficient.
- [ ] After owner review and acceptance decisions, prepare the release through Changesets and existing protected publication workflow.

The [living execution guide](tradient-feedback-0.2.0.md) contains the per-phase Resolved / Changed / Validated / Risks / Next reports. Pending live items remain unchecked; this branch does not claim rollback, exactly-once writes, native component parity or human visual approval.
