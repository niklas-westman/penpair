# A faster render route than Penpot's exporter

**Status: spike measured, not built. 2026-11-04.** Examined Penpair 0.12.0 plus the render service on `perf/render-timing-profile`, against Penpot cloud, Brave on debug port 9222, macOS. One file (about 1 800 shapes on one page), one browser. Read it before building an editor-side renderer or reopening "why is export slow".

## What is slow, and why

`s.export()` in the plugin API costs about 10 s per request whatever the frame size, measured inside the editor: a 46×46 frame took 8–17 s, a 1440×800 frame 6–15 s. Transfer, page switch and encoding are about 1 s of it (`export` now reports this as `timing`). Penpair's default stable export renders twice, so one frame costs 20–25 s.

- Penpot renders concurrently: 4 sequential renders took 55 s, 4 concurrent took 12.6 s. The shared render service (`renderFrames`) uses this, 4 at a time by default (`--concurrency 1-8`).
- Penpot's render endpoint was unreliable during the work. Calls with several concurrent exports often returned "http error". No safe concurrency level was established; the service halves on an error and falls back to single renders.
- SVG export is not a way around it: `s.export({ type: "svg" })` took 4–9 s per frame, so it goes through the same service.

## The route tried: screenshot the open editor

Zoom the editor to 1:1 on the frame (`penpot.viewport.zoom`, `.center`; `zoomIntoView` also works), then capture only the frame's rectangle from the canvas with CDP `Page.captureScreenshot`. The canvas is only about 876 css px wide in a normal window, so a larger frame needs the viewport enlarged for the capture: `Emulation.setDeviceMetricsOverride` to 2600×1800 made the editor's viewport bounds 1964×1800, and clearing the override restored it.

| Frame | Capture | Exporter |
| --- | --- | --- |
| 204×48 | 26 ms | 6–15 s |
| 1440×800 | 72 ms (2× pixels) | about 17 s |

Fidelity on the 1440×800 frame, screenshot scaled to 1× against the exporter's image: 2.1 % of pixels differ at all, 0.6 % by more than 24 of 255, maximum 203. The images look the same; the differences are text edges and a roughly 1 px offset, from clip rounding and canvas anti-aliasing. A small frame's badge that overflows the frame was cut off at the frame bounds, where the exporter keeps it.

## What this means

- It is two to three orders of magnitude faster, so the target of under 2 s per frame is reachable.
- It is a different render pipeline, so it can never match the exporter byte for byte. It is valid where **both sides use the same route**: copy verification, change detection and the pixel comparison of a copy with its source. It is not valid against a baseline or approval recorded from the exporter, and it must be labelled in any evidence as `renderer: editor-screenshot`.
- Approvals stay on the exporter until the owner decides otherwise. That is the trust decision, not a technical one.

## Not decided or not tried

- Enlarging the viewport changes the editor under the user's hands for a moment, so it needs a guard (a scratch tab, or refusal while someone edits) and always restoring.
- Content beyond the frame box (overflow, shadows) needs a margin, and the zoom and offset need snapping to whole pixels to remove the 1 px shift.
- Frames larger than the biggest viewport need tiling, or a lower zoom.
- Fonts that load lazily and images that decode late can leave a frame half drawn, so a capture must wait for the canvas to settle and compare two captures, as the stable export does.
- Only Brave on macOS at one device pixel ratio. Not tried on Docker or self-hosted Penpot, or in other browsers.
