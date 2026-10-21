# Design case coverage

A baseline frame may declare an explicit viewport, theme label, UI state, fixture identity and font expectations. Existing frames without case metadata retain their previous image workflow and appear as unknown coverage.

```json
{
  "frame": "Home / Empty / Mobile / Light",
  "id": "home-empty-mobile-light",
  "route": "home",
  "case": {
    "viewport": { "width": 390, "height": 844 },
    "theme": "light",
    "state": "empty",
    "fixture": "home-empty-v1",
    "fonts": ["Your pinned font family and weight"],
    "activeThemeIds": ["native-theme-id-if-activation-is-required"]
  }
}
```

`theme`, `state` and `fixture` are declared design intent. A label alone does not prove actual theme activation, application state or data loading. Optional `activeThemeIds` asserts the complete exact active native theme-ID set at capture; omit it for a manually styled frame and retain that uncertainty. Baseline capture remains read-only toward the Penpot document: it never switches themes. Use the separate [mode trial](mode-verification.md) for temporary theme switching.

Frame geometry and PNG dimensions must match the declared CSS viewport and observed export scale. A failed viewport/theme assertion marks `case-mismatch`, exits incomplete and preserves the previous generation. New provenance records exact design dimensions, active native theme IDs where available, API/tool version, renderer description and capture time. Font names are declarations; loaded font versions remain unobserved.

Case metadata is part of approval identity. Changing a fixture/state/theme/viewport declaration requires `--apply --update` even if the PNG bytes happen to match. Moving a matching image to a different file/page/frame identity also requires review. Recapture preserves the original approval until that explicit update. Metadata is pinned before asynchronous capture.

## Required matrix

Add `baselines.coverage.required` as an explicit list of route/viewport/theme/state/fixture tuples, up to 1000. `unsupported` can reference a required tuple with a nonempty reason. Capture constraints such as fonts and active native IDs belong on frame cases rather than matrix identities. Unsupported rows stay visible gaps; they do not become successful coverage.

See [an example matrix](../examples/coverage-matrix.json) spanning desktop/mobile, light/dark and an empty state. Only request combinations the product intends to support; no matrix is inferred from frame sizes or names.

`penpair baselines coverage --json` runs offline. It loads the version-2 manifest, checks the configured file pin, validates project-bound artifact paths, independently hashes approved PNG bytes and reports:

- `missing-case`: no configured frame for the required tuple.
- `missing-capture`: a frame is configured but has no approved capture.
- `unapproved-metadata`: approval, viewport/theme assertion or image evidence is absent/mismatched.
- `changed-unapproved`: a newer capture differs from its approved reference.
- `approved-design-intent`: approved image and declared case evidence match.
- `unsupported`: the requested combination has an explicit unresolved reason.

`designCasesComplete` means all requested design slots have matching approved intent. `browserVerification: not-run` and `accessibility: not-assessed` remain separate, even when every design slot is complete. Unknown font loading, absent activation assertions and missing renderer metadata are listed. The offline report exits 3 for gaps; it never connects to Penpot or loads project extensions.

Ordinary `baselines` can publish a coherent capture of its configured frames while the broader required matrix still has gaps; that command returns incomplete when configured requirements remain uncovered. The manifest distinguishes capture completeness from matrix coverage. An incomplete capture itself still publishes nothing. Manifest reads are bounded to 16 MiB and each approved PNG check to 64 MiB; exceeding those bounds cannot produce covered evidence.

## Browser integration

Legacy route/viewport cases continue generating their existing Reflection entries. Rich case metadata moves to `pendingCases`, including its approved provenance and capture scale, until an implementation provider explicitly maps theme setup, fixture/data loading, fonts and state entry. It does not silently generate several copies of a default-state screenshot under different labels. D4 supplies that provider integration.

Browser interaction, keyboard and accessibility checks remain separate requirements. A board's dimensions do not establish that it is clickable or WCAG-compliant. The [WCAG target-size guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) includes exceptions and spacing rules that need actual target semantics. [Playwright's visual comparison guidance](https://playwright.dev/docs/test-snapshots) also explains why stable rendering environments matter; a screenshot alone does not establish behavior.
