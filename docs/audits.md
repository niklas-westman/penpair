# Configured advisory audits

Configure an optional `audit` block with boolean `contrast`, `library`, `touchTargets`, `names`, `blankText`; explicit `interactiveIds`, `allowBlank`; optional `nameSegments` (default 3); and reasoned exact-node `suppressions: [{rule,nodeId,reason}]`. Unknown settings refuse before connecting. The configured audit uses a complete page-root inspection; legacy filters remain available when configured rules are absent.

Run `audit --page PAGE`, or offline `audit --from INSPECTION --token-source TOKENS`. The offline token catalog must share exact file/revision and contain actual resolved values in active set order. Missing, foreign, mixed, transparent, gradient/image, unbound or mismatched paint evidence remains unknown. Contrast measures an opaque sRGB subset and checks that observed paint matches the resolved binding. It does not infer compositing, overlapping paints or browser font/rendering behavior.

The review thresholds follow [WCAG contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html): 4.5 ordinarily, 3 for the explicitly assumed large text size/weight. Ratios are compared without rounding. Design units are assumed to correspond to CSS pixels; exceptions and actual implementation behavior still require review. This tool does not establish accessibility compliance.

Touch-size signals apply only to explicit interactive IDs. Below 24 units is a warning; below 44 is a preference signal. The [minimum target guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) includes spacing and other exceptions; [enhanced targets](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html) use a larger threshold. Size alone does not prove clickability, CSS scale, spacing, keyboard support or conformance.

Library coverage reports native copy instances among known nodes, unknown component fields and the largest observed primitive groups. It is a composition signal, not a component quality score. Naming checks slash-separated frame segments/default names. Blank/placeholder text can be allowed by exact node ID; suppressions retain the finding and reason visibly.

Findings are advisory and never mutate the file. Complete findings return exit 0 even with warnings; partial source/refused inspection or bounded output truncation remains incomplete (3). The report retains exact total counts, suppressions, source identity and assumptions. A successful traversal does not convert unobserved fields into known values.
