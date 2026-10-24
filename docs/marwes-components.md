# Measured component pilot

`penpair marwes components snapshot [--write]`, `check [--measure]` and `diff` compare Button, Card and StatTile in explicit light/dark contexts. This is a pilot, not a generated native library. `build` refuses until a live pinned-API experiment proves text/style instance overrides survive updates. Measurement snapshots alone do not establish that native behavior.

The adopting project owns a stable fixture rendering its installed components with its actual theme, state and fonts. Use explicit selectors and named `data-pilot-part` anatomy nodes. React component names are not inferred from the DOM. Start with six cases (three components, two modes) and add actual states as needed, up to 60. Add this adapter-owned block under `marwes`:

```json
{
  "components": {
    "schemaVersion": 1,
    "renderer": "design/component-pilot/renderer.mjs",
    "sources": ["src/component-pilot.tsx", "src/theme.ts", "pnpm-lock.yaml"],
    "snapshot": "design/marwes-components.snapshot.json",
    "cases": [
      {"id":"button-light","component":"Button","theme":"light","state":"default","viewport":{"width":1280,"height":900},"selector":"[data-pilot='button']"},
      {"id":"button-dark","component":"Button","theme":"dark","state":"default","viewport":{"width":1280,"height":900},"selector":"[data-pilot='button']"},
      {"id":"card-light","component":"Card","theme":"light","state":"default","viewport":{"width":1280,"height":900},"selector":"[data-pilot='card']"},
      {"id":"card-dark","component":"Card","theme":"dark","state":"default","viewport":{"width":1280,"height":900},"selector":"[data-pilot='card']"},
      {"id":"tile-light","component":"StatTile","theme":"light","state":"default","viewport":{"width":1280,"height":900},"selector":"[data-pilot='tile']"},
      {"id":"tile-dark","component":"StatTile","theme":"dark","state":"default","viewport":{"width":1280,"height":900},"selector":"[data-pilot='tile']"}
    ]
  }
}
```

Copy/adapt [renderer.mjs](../examples/component-pilot/renderer.mjs) into that project, install Playwright and its browser there, and start its local fixture server. The adapter has no mandatory browser dependency. The example uses [Playwright page evaluation and viewport contexts](https://playwright.dev/docs/api/class-page) to read computed styles after fixture readiness. It checks the observed theme/state attributes rather than treating query labels as activation proof. Fixture readiness must also guarantee deterministic content, disabled animations and expected font faces. A loaded font set alone does not prove the intended font exists.

The renderer is explicitly trusted project code, loaded only by measurement commands. It exports `async measure(cases)` returning one observation per ID, each with `parts`, and `environment: {browser, fontsReady}`. Each part returns every exported `componentProperties` key, using null for unknown. No null properties or unready fonts can replace the committed snapshot. JSON inputs are bounded to 4 MiB; sources stay inside the project. Include all relevant transitive fixture/theme/font/lock files in `sources`: hashes are not a dependency graph or sandbox. Renderer cancellation follows the cooperative command boundary; arbitrary trusted module code can ignore it.

`check` without `--measure` only compares declared sources, renderer, effective token hash and library version. It reports `anatomyMeasured:false`, even on success. `check --measure`/`diff` actually execute the renderer and compare complete observations; an environment change also causes drift. `snapshot` defaults to review and `--write` atomically publishes only complete unredacted evidence. Version-1 snapshots have a content hash and do not imply approval.

`tokenCandidates` lists exact typed scalar matches in the selected mode, preserving multiple matches. It does not infer semantic bindings, resolve arbitrary formulas, or synthesize typography from equal scalar properties. Constants without candidates remain measured raw values; declare intentional token additions through project extras, then review them. Automatic promotion of three consumer-specific radius constants awaits actual fixture measurements.

The live acceptance exercise is separate: build one native component, instantiate it, customize instance text and style, update the main component idempotently, independently verify both custom overrides and unchanged instance IDs, export twice, and inspect the images. Record pinned API/library versions and owner-authorized scratch target. Until that passes, do not expand the catalogue or claim this snapshot represents native Penpot component anatomy/instance-use counts.
