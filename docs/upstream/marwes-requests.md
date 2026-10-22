# Marwes requests for owner review — 2026-10-21

Status: **draft, unsent**. This document does not authorize an email, issue, package change or consumer edit. Review against the maintainer's current version before sending. Evidence is the installed 1.11.0 React/core package source and Claude's dated original trial notes; no new live component measurements were taken.

## Correct the starting assumptions

- `StatTileProps.trendValue` and `trendDirection` are already optional in React 1.11.0. The source conditionally omits the trend region. Drop the request to add optional trend support. A missing trend in a Penpot helper is an adapter/composition issue until proven otherwise.
- `StatTile` omits arbitrary `children`, but `StatCardProps` already aliases `CardProps`, which accepts children. Ask whether composing a sparkline in StatCard is the intended route before requesting another slot/API.
- The installed React export list has no Sidebar/SidebarNav symbol. The consumer already implements its own `SidebarNav`; a new consumer sidebar is unnecessary. An upstream navigation primitive is an optional library discussion, not a blocker for that implementation.
- Card/StatTile radii and typography values in the original brief are historical observations in one project theme/viewport/state. They are not newly verified universal library constants. The C1 measurement pilot still needs a real fixture and native instance-override proof.

## Prioritized requests

| Priority | Draft request | Evidence and acceptance |
| --- | --- | --- |
| P1 | Expose stable component anatomy/measurement metadata and fixture selectors. | Core 1.11.0 recipes expose data-component/slot class names, but those are not a complete versioned measurement contract. Start with Button/Card/StatTile across explicit light/dark/state/viewport fixtures. Ask for documented stable selectors and supported measurements; preserve actual semantic token names instead of inverse-matching equal colors/radii. |
| P1 | Document or expose component-derived radius and typography roles. | The source theme variable inventory includes general radius/radiusButton and typography scales. Claude reported Card radius 8, StatTile radius 24 and StatTile value 28/600/-0.84 in its trial context. Ask for the relationship to theme inputs and supported semantic roles; let new measurements establish values before proposing named tokens or formulas. Acceptance includes theme changes and explicit fallback constants. |
| P2 | Clarify the supported StatTile/StatCard composition route for charts. | StatTile has a fixed typed body; StatCard accepts normal Card children. Ask for a documented chart composition recipe first. Add a new slot only if the existing composition cannot preserve intended layout, keyboard behavior and semantics. |
| P2 | Discuss an upstream sidebar/navigation primitive if several consumers need the same contract. | No export in the inspected 1.11.0 React declarations; the consumer's existing SidebarNav already supplies its local implementation. Acceptance should cover active state, keyboard/focus semantics, responsive collapse and theme roles. Collect a reusable requirement before proposing upstream code. |
| P3 | Check numeric-zero trend rendering and trend accessible-label input. | React source accepts ReactNode, renders trend with a truthiness check, and passes only string values to the core trend-label recipe. Ask for a focused test of `trendValue={0}` and numeric content. This is a source-based candidate edge case, not an observed browser/accessibility failure. |

## Review/send checklist

- [ ] Owner selects which requests are useful and approves exact wording.
- [ ] Maintainer/current-version check confirms the requested capability is still absent or undocumented.
- [ ] C1 fixture captures exact theme, viewport, state, fonts and source version for numerical claims.
- [ ] Attach only owner-reviewed, non-private evidence and a minimal reproduction.
- [ ] Owner decides whether to send; no message or issue has been created here.
- [ ] Record maintainer response and resulting backlog changes after an authorized exchange.

## Reproduction evidence

Read [the source inventory](marwes-1.11.0-evidence.json). It records package versions and source-map hashes, with source paths within those maps. It contains no consumer designs, credentials or private project source. Reproduce with the same package artifacts and inspect the named source entries; rendered behavior still needs a real fixture.

These corrections strengthen Claude's brief: the useful requests are about reproducible anatomy and explicit semantic contracts. Existing optional props and consumer components should be reused before asking for duplicate capabilities. Equal measured values alone cannot establish token semantics or make design-to-code behavior mechanical.
