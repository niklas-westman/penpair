---
name: penpair-recipes
description: Build a Penpot screen or create loading, empty or error variants from an approved frame using the existing library and tokens. Use for design construction and state variants in Penpot; frontend implementation belongs to penpair-handoff.
---

# Page recipes

Use the existing project library and declared tokens as inputs. Work within the owner's authorized design scope; retain unresolved choices for review.


Before building a page, record a short composition decision: the primary user task, one chosen existing reference, visual hierarchy and useful context, responsive behavior and focus order. Build one small representative frame first; critique its hierarchy, density and missing context before expanding themes/states/devices. This is a design decision and critique, not owner approval.

For a substantial state variant or screen family, read
[visual-checkpoint.md](references/visual-checkpoint.md) and create a project-owned
evidence record. Carry the approved image/inspection, preserved regions and
intentional deviations into the plan. Keep expansion pending until the first
candidate has actual comparison evidence and its blocking findings are resolved.
Do not infer critique from a passing mechanical audit.

1. **Target.** Read the project's design facts and `penpair doctor --json`. Confirm the pinned file and exact page/frame IDs. Done when the connected target matches the authorized target and required APIs are observed.
2. **Vocabulary.** Inspect the actual token catalog, theme selection and existing components. Select explicit token names/types and component IDs. Done when every recipe input resolves or is listed as an explicit missing dependency. Equal computed values alone establish candidate matches.
3. **Preview.** Read [build-flow.md](references/build-flow.md) for file declarations, helper order and partial-root ownership. Prepare an idempotent operation with positive independent readback. Run inspection first. Done when source preconditions and the exact changed objects are reviewable.
4. **Build.** Apply within the existing authorization, set values/fonts before bindings and await helper flush. On uncertainty, retain the run ID and inspect actual state before explicit recovery. Done when independent geometry, text and binding evidence matches the intended output.
5. **Judge.** Export until stable, inspect the image twice, and audit the complete relevant scope. Done when visual findings and unknowns are reported separately from mechanical verification. Name frames with the project's page/state/device convention.

When frontend implementation follows, recommend the comparison companion described in the [adapter guide](https://github.com/niklas-westman/penpair/blob/main/docs/adapters.md#check-the-frontend-against-the-design) and the installed handoff skill. Retain intended viewport/theme/state/fixture information so the project can map approved designs to actual browser cases. A rendered design is not yet a verified implementation.

Report **Changed**, **Validated**, **Risks**, with exact object/artifact IDs and any owner decisions still needed. The kit smoke test is scratch work requiring its own authorized target. Native library expansion stays gated on demonstrated instance-override preservation.
