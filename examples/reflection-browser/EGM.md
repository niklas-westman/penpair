# Browser comparison starter

## Overview

A starting `ImplementationProvider.runCase` implementation that captures a real
browser screenshot of a design region and compares it to an approved baseline by
**exact decoded RGBA pixels** — no resizing, no threshold-based approval. The
module's governing idea is that every claim must be independently observed: the
project's hooks establish state, the provider re-reads what actually rendered, and
a numeric diff ratio is evidence rather than a verdict. Owner review is still
required.

`capture.mjs` and `provider.mjs` are meant to be **copied into the adopting
project** (or consumed from `node_modules/@penpair/web/examples/reflection-browser/`).
`serve.mjs` and `fixture-hooks.mjs` exist only to drive this repository's own
plumbing smoke test and are explicitly **not** application evidence.
Adopter-facing instructions, the full hook contract table and the font licence
provenance live in [`README.md`](./README.md) — do not fold them into here.

## Interface

| Module | Exports |
| --- | --- |
| `capture.mjs` | `outwardClip(box)` — round a document box outward to whole CSS pixels; `captureCase(page, test, hooks, { timeoutMs })` → `{ screenshot, observed, fonts, fontsReady, capture }`; `compareImages(page, baseline, screenshot)` → changed-pixel ratio; `comparePng` — alias retained for existing PNG callers |
| `provider.mjs` | `createBrowserProvider({ browser, baseURL, projectRoot, hooks, deviceScaleFactor, timeoutMs, io, imageFormat, encodeLosslessWebp })` → `{ runCase(test) }` |
| `fixture-hooks.mjs` | `hooks` — the local fixture's `route`, `setup`, `prepareCapture`, `observe`, `captureRoot`, `expectedFonts`. **Repository fixture only.** |
| `serve.mjs` | No exports. A loopback static server for `fixture/index.html` and `fixture/Abel-Regular.ttf`. Side-effecting entry point. |

Required project hooks: `route(test)` (checked as a function by `createBrowserProvider`),
`setup(page, test)`, `observe(page, test)`, `captureRoot(test)` and
`expectedFonts(test)` (checked as functions by `captureCase` at call time), and optional `prepareCapture(page, test, root)`.

`runCase` returns `schemaVersion: 1` evidence with `baselineHash`, `observed`,
`fonts`, `screenshot` path, `diffPixelRatio`, full `capture` metadata and
`provider: { name: "penpair-browser-starter-rgba-exact", version: "2" }`.

## Invariants

- **The route hook cannot wander.** `runCase` throws unless the hook's URL has the
  configured `baseURL` origin *and* equals `test.route` exactly, and throws again
  after capture if the application navigated away.
- **The baseline is content-pinned.** The baseline file is hashed with SHA-256 and
  must equal `test.baseline.sha256`. A changed baseline stops the run.
- **A capture can never overwrite its baseline.** `runCase` compares the resolved
  output path with the resolved baseline path and throws if they coincide.
- **`observe` must read actual rendered evidence.** The provider compares observed
  `{ viewport, theme, state, fixture }` against the requested intent and throws on
  any difference. A hook that echoes the request back defeats the only check that
  matters.
- **Explicit webfont evidence is mandatory.** `expectedFonts` must be a non-empty
  array of `{ family, weight, style }`, and each face must be observed `loaded` in
  `document.fonts`. System-font fallback is not evidence.
- **Layout must settle, provably.** Three *equal* consecutive root boxes across
  animation frames, within `timeoutMs`, capped at 120 frames; otherwise
  `"Capture root did not settle"`, or `"Capture layout deadline exceeded"` when a
  frame does not arrive before the deadline.
- **The capture root resolves uniquely** and must have at least a 2×2 observable
  viewport area.
- **Occlusion and hover are refused, not hidden.** Five sampled points must all hit
  inside the root, the pointer is parked at `(-10, -10)` outside the viewport, and
  any `:hover` on the root or its controls throws. The starter never hides the
  adopter's shell — that is `prepareCapture`'s job. Sampling is finite: inspect
  images for unsampled overlays.
- **Geometry is never massaged to fit.** The box is rounded **outward** to whole CSS
  pixels; rounded width/height must equal the design viewport and
  `devicePixelRatio` must equal `test.baseline.scale`, or it throws
  `"do not resize the image"`. The clip is taken against the full document so
  viewport trimming cannot silently drop a pixel.
- **Nothing may change during the capture.** `observe` runs again afterwards and the
  root box is re-measured; any difference throws `"Browser source changed during capture"`.
- **Comparison is exact.** `compareImages` decodes both images in a canvas, requires
  identical dimensions, and counts any pixel differing in R, G, B **or** A. There is
  no tolerance threshold. Inputs must be real PNG or WebP by magic bytes.
- **Lossless WebP is verified, not trusted.** `imageFormat` is `"webp"` or `"png"`
  only; `"webp"` requires an `encodeLosslessWebp` hook, the encoded bytes are checked
  for the `RIFF`/`WEBP` container, and the encoded image is re-compared against the
  capture — a non-zero diff throws. `quality: 100` alone is not lossless.
- **Evidence is written atomically** through `@penpair/core`'s `atomicWriteFile`,
  with the path derived from `sha256(test.id + ":" + test.setup)`.
- `@penpair/core` must be at the same version as every other Penpair package, or its
  three IO helpers must be passed explicitly as `io`.
- The repository fixture's references are **deliberately unapproved synthetic
  fixtures**: they exercise plumbing and are not Penpot acceptance or owner-approved
  baselines.
- No credentials in hooks or in evidence.

## Side Effects

- **Creates a browser context per case and closes it in `finally`.** It does not
  launch or own the browser — the caller passes one in and must close it.
- **Network requests to the configured `baseURL`**, and page script execution in the
  browser (`page.evaluate`) for measurement, occlusion sampling and comparison.
- **Disk reads:** the baseline image resolved under `projectRoot`.
- **Disk writes:** one image per case at `.penpair/reflection/<sha256>.<webp|png>`
  under the resolved project output root, creating the directory recursively and
  replacing any existing file.
- **Moves the real mouse pointer** to `(-10, -10)` and scrolls the page as part of
  capture setup.
- `serve.mjs` **binds a TCP port** on `127.0.0.1` (`PENPAIR_EXAMPLE_PORT`, default
  `4174`) and serves two files from `fixture/` with `Cache-Control: no-store`. It is
  a long-running process; `scripts/smoke-browser.mjs` forks and stops it.
- Mutates no Penpot file and touches no design content.

## Verification

- Plumbing trial, from the repository root: `pnpm smoke:browser`
  (`pnpm build && node scripts/smoke-browser.mjs`). It forks `serve.mjs` and imports
  `captureCase`, `outwardClip`, `createBrowserProvider` and `hooks` from this
  directory, then exercises wrong theme, missing face and weight, delayed font
  loading, scale mismatch, hover and sticky occlusion, and verifies the baseline
  bytes are unchanged. **It requires a locally installed pinned Playwright and
  browser**; optional `PENPAIR_PLAYWRIGHT_MODULE`, `PENPAIR_BROWSER_EXECUTABLE` or
  `PENPAIR_BROWSER_CHANNEL` select them. No absolute machine paths are committed.
- `scripts/smoke-package.mjs` separately asserts that the packaged copy ships here
  and that `outwardClip` is importable from it.
- A passing smoke run verifies plumbing only. It is not design acceptance: inspect
  the images and retain `owner-review-required`.
