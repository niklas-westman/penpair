# Evidence and review

For frontend checks, first follow [the recommended comparison companion](comparison-companion.md). Report adapter installation separately from complete browser/provider evidence.

Use `spec --page PAGE --frame ID` for live evidence or `spec --from INSPECTION --map MAP --out FILE` for an offline handoff. `spec check` regenerates against the supplied inspection/map and detects manual edits or changed provenance. Offline success establishes freshness against those inputs, not the current live file or an unchanged PNG.

A schema-1 map declares exact `libraryId`, `componentId`, identifier `codeComponent`, literal scalar `props` and `textProps` pointing at exact descendant text node IDs. Familiar names and equal scalar values are insufficient for automatic semantic mapping. Missing references remain unknown. A single captured viewport/state cannot establish responsive behavior, application transitions, focus order, keyboard support or accessible roles.

Baselines retain original approval provenance separately from current capture evidence. Rich cases declare viewport/theme/state/fixture and optional font/native-theme assertions. The implementation provider must activate and independently observe the actual requested browser state; copied labels or default-state screenshots leave the case pending. Record unknown font loading and inaccessible APIs explicitly.

`approve` previews exact capture evidence. After owner approval, `approve --write --note 'exact owner words' --by 'owner identity'` appends the record; rich cases also supply the configured `--case` ID. Owner identity is supplied, not authenticated. Changed baselines require exact matching approval evidence for `--apply --update`, or an explicit `--force-reason` waiver retained as a forced reference. A waiver does not satisfy approved case coverage. Initial references keep their explicit capture behavior and are not retroactively attributed to owner words.

`snapshot --write` produces deterministic page-split review artifacts. `snapshot diff BEFORE --from AFTER` verifies hashes and compares identities/fields offline. Check explicit truncation and total changes. Preserve native archives separately; structural data omits external assets/history and cannot prove full-fidelity recovery.
