# Per-theme resolved values and mode images

`penpair marwes tokens diff --resolved` inspects a mode trial. Add `--apply` only after reviewing its planned states: actual resolution requires temporarily changing active themes and sets. A current committed token snapshot is required. Ordinary `tokens diff` remains a declared-value comparison.

```sh
penpair marwes tokens diff --resolved --apply
penpair marwes tokens verify-modes FRAME_ID --page Candidate --out design/modes
penpair marwes tokens verify-modes FRAME_ID --page Candidate --out design/modes --apply
```

Open the requested page before inspecting image trials. The frame must exist and expose export support before any trial mutation. IDs, file pinning, revision/source preconditions, writer coordination, optional `--checkpoint`, journals and explicit `--resume RUN_ID` use the normal write safeguards. Config-free standalone mode is unavailable.

Each declared theme is measured in an **isolated theme context**: all other themes are temporarily disabled, and active sets must exactly match that theme. This tests the generated mode rather than silently combining unrelated density or brand axes. It does not establish every combination of those axes. The report shows actual and expected global set order; the catalog's precedence matters even when theme membership is correct.

After bounded layout completion, two equal resolved observations are required (up to 20 samples within a five-second observation budget). Each expected token is compared with its actual API `resolvedValue`, with type and unknown evidence retained. Requests are bounded independently; the common overall command deadline still applies. Equal observations are evidence at capture time, not proof of persistence or eventual autosave.

The independent expectation resolves references from the committed snapshot under its declared set order. Numeric values use a bounded grammar for parentheses, unary signs, addition, subtraction, multiplication and division; references are cycle/depth checked. No JavaScript is evaluated. Supported colors, font-family lists and known typography field aliases are compared structurally. Unsupported formulas/units, nested font arrays, missing API values and composite shadow resolution remain unknown and yield incomplete evidence. Nothing is inferred from a flattened object string.

## Restoration and failure

The complete original active state of every theme and set is saved before mutation, including multiple groups or a custom selection. The service restores it in `finally` and independently reads it back. Restoration success is separate from successful mode comparison. A trial whose modes match but whose restoration fails cannot pass or publish a new image generation.

Cancellation gets a separate cooperative ten-second restoration deadline. This permits the explicitly promised cleanup to finish after the main command is cancelled; it does not turn an uncertain mode activation into a confirmed measurement. A lost activation response is never automatically replayed. Restoration is a separate idempotent write based on observed state. Changed token declarations or an unexplained selection can require manual inspection instead of being overwritten.

The journal records one compound trial, its original state, mode evidence and restoration result. `verified` journal state means the trial protocol ended with independently restored selection; the report's `verified` additionally requires complete, matching mode values. Uncertain or incomplete measurements remain explicit. Resume can recover an already-restored report without replay. When image bytes were not published before interruption, start a fresh explicit trial to collect them; resume does not invent missing images.

Exits: 0 for a complete matching applied trial (or a complete inspection plan), 2 for measured drift, 3 for incomplete resolution/capture evidence, 4 for uncertain execution, and 1 when restoration fails without a stronger uncertain outcome. The outer command can still report cancellation/deadline. Inspect the saved journal and original selection before further writes after any failure.

## Images and provenance

Image trials export the same frame separately in each mode and retain stable-render identity, active themes, source/snapshot hashes, byte SHA-256 and capture time. Resolution is rechecked after export. Only a complete collection with verified restoration publishes an immutable image generation and atomically replaces its root manifest pointer. The pointer hashes its generation manifest. Prior output survives partial exports and restoration failures. A journal that required credential redaction makes the evidence incomplete and prevents publication. These images are review evidence; they do not approve a baseline or establish visual parity.

Limits: 1–20 declared themes, 5000 source tokens, bounded source/resolved documents and the existing 90 KB final wrapped snippet guard. A large exact source precondition can refuse before delivery. Stable set/theme IDs and switching/resolution capabilities are required. No new live pinned-version trial has been performed.

The official [theme API](https://doc.plugins.penpot.app/interfaces/TokenTheme) explains group behavior and custom-set activation. Resolved-value forms follow the [sizing](https://doc.plugins.penpot.app/interfaces/TokenSizing), [font-family](https://doc.plugins.penpot.app/interfaces/TokenFontFamilies) and [typography](https://doc.plugins.penpot.app/interfaces/TokenTypographyValue) references. Unsupported runtime forms stay visible instead of being guessed.
