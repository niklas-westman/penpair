# Sources and what was taken

The rules come from a research report on design guidance, checked on 14 October 2026 (kept by the skill's author, not included here). The original sources were read through summaries, so quotes and numbers are second-hand. `[S##]` follows the report's register. Re-read the primary page before relying on a number.

## Adopted, as conditional rules

| Idea | Source |
|---|---|
| Colour for categories, position and length for quantity; avoid pie, donut, gauge, 3D; colour paired with shape or label | NN/g dashboards [S23] |
| Chart type by relationship, common baseline, stock versus flow | ONS [S25] |
| Table actions in three scopes, row heights, batch bar | Carbon data table [S26] |
| Progressive disclosure, two levels, split by measured use, not for interdependent steps | NN/g [S27] |
| Visible focus, labelled inputs, errors near the field, state in the URL, confirm destructive actions | Vercel web interface guidelines [S12] |
| Frequency governs motion | Kowalski design-eng [S10] |
| Target size 24 CSS px at AA, 44 at AAA | WCAG 2.2 SC 2.5.8 [S37] |
| About three type sizes, hierarchy by scale, contrast, grouping | NN/g [S22][S42] |
| Separate what is known about looks from what is known about the work | NN/g UX-Context [S39] |
| Decision brief, plain-language labels, plan then review then build | Anthropic frontend-design [S04], Interface Design [S02] |
| Critique evidence split, bounded verification | Impeccable critique [S08], the report's section 9 |

## Rejected or kept as taste

60/30/10 colour split, "signature element", fixed text tiers, one depth strategy [S02]; Impeccable font and colour bans [S07]; "SaaS-card kit" as a failure [S04] (cards are legitimate in an operational product); the F-pattern as a law and the uncited "20 percent" figure [S24]; easing curves and exact millisecond ranges [S10]; "44 pixels (WCAG)" [S02][S18]; "50+ participants" for tree tests [S16]. The rules suit a calm, dense operational tool; marketing-page art direction does not apply.

## Not installed

Interface Design, Impeccable, UI UX Pro Max and Intent write files, run hooks or binaries, or fetch live pages. Each would create a source of truth beside the project's own designs and library. Vercel's guidelines fetch an unpinned file on each review; this skill keeps the rules it needs instead.

## Unread

Refactoring UI [S21] (HTTP 403). Impeccable `craft-floor.md`, Kowalski's other skills, the UI UX Pro Max references, and [S20][S28]-[S35][S38][S40][S41] were not read.
