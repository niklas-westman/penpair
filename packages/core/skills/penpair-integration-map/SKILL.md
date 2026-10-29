---
name: penpair-integration-map
description: Create, review or reconcile Penpair integration maps connecting a user journey and design evidence to routes, components, state, data and implementation verification.
---

# Integration map

Before unfamiliar commands, read the installed help for `integration-map` and
`export`; newer versions also offer `help export batch` and
`help workflows.capture-evidence`. Use actual supported help on older versions.
Lossless WebP is valid source evidence when its path and exact byte hash are
recorded. Converting an approved PNG changes artifact identity and requires the
normal source/review update. Cache hits are reused review images, not fresh proof.

Probe frame names, counts and geometry before expensive captures. Critique one
representative frame before a batch; export frames instead of whole sections.
Use `export --frames ID=NAME,... --page PAGE` for the complete family, adding
`--cache` only for ad-hoc reuse. Stream stderr in the foreground or through `tee`
with `pipefail`; never hide it with `tail -N` or buffered subprocess capture.
Identical `import --out` proposals may be reused; changed output requires a new
path. Preserve previous artifacts and inspect locks/projections before recovery.
Before recommending `wake --reload`, verify that saving finished in the editor;
reload can discard unsaved changes and an editor revision is not save proof.

Read [the detailed workflow](references/workflow.md) for coverage, review and
recovery boundaries.

Make the proposed solution and existing implementation comparable. Read the
current journey contract and its exact hash before planning application work.
Use `penpair-journey-map` when intent is missing; use `penpair-handoff` for detailed
source/component evidence and `penpair-verify` for a running frontend.

1. **Inspect the current solution.** Read complete authorized design inspections,
   explicit component identities and existing routes, state and data code. Keep
   stable IDs, paths and hashes. A design observation is not proof of a handler,
   backend behavior, responsive rule or accessible interaction.
2. **Record the integration.** Create project-owned schema-1 `integration-map`
   JSON referencing the exact journey path/hash. Map requirements to screens,
   routes, reusable components, state, data/API responsibilities and verification
   work. Mark each claim's origin; retain unknowns and open blocking findings.
   Keep proposals proportionate to existing architecture.
3. **Review gaps in both directions.** Identify intent without implementation
   and implementation without an agreed rationale. Record evidence, user impact,
   proposed resolution and next action. Include loading, empty, error, success,
   keyboard/focus and accessibility work as applicable.
4. **Check and render.** Use installed command help for `integration-map` actions.
   Check source/review freshness, render and inspect the resulting map. For
   native publication use `penpair-diagrams`, compile snippets and retain pinned
   inspection, one idempotent write, independent readback and stable visual
   exports. Keep each snippet below 90 KB and do not retry uncertain writes.
5. **Approve deliberately.** Import native managed changes as a base-hash-bound
   proposal; explicit semantic acceptance creates an unapproved revision. Presentation-only
   changes retain canonical intent but require renewed visual review. Record map
   approval only from actual owner words for the exact contract. Image approval,
   map review and implementation acceptance remain separate.
6. **Continue from context.** Give implementation agents the bounded current
   context plus required evidence paths. Report stale sources, omitted context,
   blockers and unknowns. After implementation, reconcile real code and browser
   evidence against requirements; a reviewed map cannot verify the implementation.

See the [integration-map guide](https://github.com/niklas-westman/penpair/blob/main/docs/integration-maps.md).
