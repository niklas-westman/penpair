# Component pilot renderer

## Overview

A starter renderer that measures the *real* components of an adopting project in a
real browser and returns their computed anatomy. It backs the `component-pilot`
measurement kind in `@penpair/marwes-ui` (schema `urn:penpair:schema:v1:component-pilot`,
see [`packages/marwes-ui/src/components.ts`](../../packages/marwes-ui/src/components.ts))
and is documented for adopters in
[`docs/marwes-components.md`](../../docs/marwes-components.md).

This is a template to **copy into the adopting project**, conventionally at
`design/component-pilot/renderer.mjs`. The file's own first line says so: Playwright
and its browser are optional dependencies of that project, not of this repository.
The adapter has no mandatory browser dependency.

## Interface

- `measure(cases)` → `Promise<measurement[]>` (async, named export).
  Each case supplies `{ id, viewport, theme, state, selector }`.
  Each measurement is `{ id, parts, environment: { browser, fontsReady } }`, where
  `parts` maps `"root"` plus each `data-pilot-part` name to the 18 measured computed
  properties.
- Module-private `properties` — the fixed measured property list: `width`, `height`,
  the four `padding*`, `rowGap`, `columnGap`, `borderRadius`, `borderWidth`,
  `borderColor`, `backgroundColor`, `color`, `fontFamily`, `fontSize`, `fontWeight`,
  `lineHeight`, `boxShadow`.
- Imports `chromium` from `playwright` — supplied by the adopting project.

## Invariants

- **The fixture contract is the adopter's half.** The project's fixture must render
  the real pinned components with its actual theme, and must expose the observed
  context and the `data-pilot-ready="true"` marker **only after** activating the
  requested state. A ready marker that appears before activation invalidates the
  measurement.
- **Observed state is checked, never assumed.** The renderer reads
  `data-pilot-theme` and `data-pilot-state` off the root and throws
  `"Fixture context was not activated"` when they disagree with the request. Query
  parameters are the request; the attributes are the proof.
- **The selector must resolve uniquely.** Missing, or matching more than once, throws.
- **Anatomy part names must be unique.** A duplicate `data-pilot-part` throws rather
  than silently overwriting a measurement.
- **Fonts are awaited before measuring.** `await document.fonts.ready` precedes any
  `getComputedStyle` call. A loaded font set alone does not prove the intended font
  exists — that judgement stays with the reviewer.
- Each case gets a fresh browser context with its own viewport and
  `reducedMotion: "reduce"`.
- Fixed route and origin: `http://127.0.0.1:4173/component-pilot` with `theme` and
  `state` as query parameters. Navigation waits for `networkidle` (15 s); the ready
  marker waits 10 s.
- **Resources are always released.** Nested `try/finally` closes every context and
  the browser, on success and on throw.
- Measurement is evidence, not approval. The output does not accept a design.

## Side Effects

- **Launches a Chromium browser process** and creates one browser context per case.
- **Network requests to `127.0.0.1:4173`** — the adopting project's local fixture
  server must already be running. Nothing starts it here.
- Executes page script in the browser to read computed styles; reads
  `navigator.userAgent` and `document.fonts.status` into the result.
- Writes nothing to disk and makes no external network calls.
- Mutates no Penpot file and touches no design content.

## Verification

- This directory has no test suite of its own, and nothing in this repository executes
  `renderer.mjs` — it is a copy-into-your-project template, verified in the adopting
  project against its own fixture.
- Formatting is in scope here (unlike the raw sandbox examples): `biome.json` does not
  exclude this directory. The root orchestrator runs `pnpm format`.
- The repository's full gate is `pnpm check`. It needs a git checkout or worktree,
  because `scripts/check-code-paths.mjs` shells out to `git ls-files`. In a source copy
  without `.git`, run the stages individually and report the validation as partial.
