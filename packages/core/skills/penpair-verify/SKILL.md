---
name: penpair-verify
description: Verify a frontend against an approved Penpot design using Penpair Reflection Check. Use to check visual parity, investigate design mismatches or recheck an implementation after fixes with real browser screenshots and observed application state.
---

# Frontend verification

## What this owns

Comparing a running frontend against its approved design.

Not here: New implementation or missing component mappings — `penpair-handoff`.
Not here: Penpot changes, which keep the project's write protocol — `penpair-design`.
Not here: Proposed contract changes — `penpair-integration-map`.

## Before you start

Before unfamiliar CLI work, read the installed `penpair --help`, then the matching
command/topic help. Use `penpair help workflows.iterative-build`,
`penpair help workflows.capture-evidence`, `penpair help diagnostics.progress`,
`penpair help run-file.stages` or `penpair help queue.recovery` as relevant.
On an older CLI without topics, use its actual supported help and omit unsupported
flags. Never fetch a global replacement. Build and visually critique one
representative frame before expanding. Prefer scoped flush and verified stages.
Ad-hoc export caching is not fresh pixel proof and never replaces baseline capture.
Run captures in the foreground; preserve stderr and parse final stdout JSON plus
exit/completeness. To save logs use `tee` with `pipefail`; never `2>&1 | tail -N`
or buffered child stderr. Staging/files appearing does not imply publication or
owner approval.


Compare the real implementation with the exact approved design case. Use the
project's configured browser provider and component library. A captured design,
an installed adapter and a passing build each establish different facts.

Read the current integration-map or finalized design-release context when one
exists. Reconcile actual routes, state and behavior with stable requirement IDs,
and report missing implementation or unintended behavior alongside visual drift.
Do not rewrite reviewed intent or a finalized release to make a failing
implementation pass.

Design finalization, image approval and implementation acceptance are separate.

Continue the project's existing comparative checkpoint, or create a project-owned
case report outside installed skill folders. Retain source/candidate identities,
preserved and changed regions, actual image paths, observed setup, consequential
findings and the next action. When installed,
`penpair-construct/references/visual-checkpoint.md` and its template supply the
common format.

## Steps

1. **Establish readiness.** Inspect the installed command and adapter versions,
   the project's existing verification scripts, approved reference and explicit
   case mapping. Use the local command (`pnpm exec penpair` in pnpm projects).
   Report installed, registered, references approved, cases mapped, provider
   configured, browser verified and owner reviewed separately. Keep unavailable
   stages pending; do not invent approval or replace an unimplemented setup.
2. **Plan the case.** Run `penpair reflection plan --map FILE`. Confirm the
   reference identity/hash and intended route, viewport, theme, state, fixture and
   fonts. Start with one representative case before expanding the matrix. For
   browser evidence requirements, read [browser-evidence.md](references/browser-evidence.md).
3. **Run the real browser.** Start or reuse the authorized local application and
   run `penpair reflection check --map FILE --provider FILE`. The project module
   must activate and independently observe the requested application state.
   Exit 0 means complete evidence within thresholds; 2 means measured drift;
   3 means incomplete evidence. An execution error establishes no comparison.
4. **Inspect and repair.** Look at the approved image and actual browser image;
   inspect a diff image when the checker produces one. Record consequential
   findings as location, impact, evidence, proposed fix and rerun case. Fix
   implementation mismatches within scope, then recapture affected cases. Do
   not overwrite approved references, change case intent or loosen thresholds
   merely to pass. A design change goes back through design review and approval.
5. **Checkpoint and report.** If repeated failures or substantial tooling work
   prevent a representative visual result, report the evidence and revised
   approach before expanding tools or cases. Retain case IDs, image paths,
   findings and the next action so another agent can continue. Report **Changed**,
   **Validated**, **Risks**, separating comparison, visual critique, accessibility
   checks and owner approval. A low pixel ratio does not establish any of the last
   three.

Reading a skill never authorizes an extra live write.
