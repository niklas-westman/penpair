# A faster render route than Penpot's exporter

**Status: built as an opt-in (`--renderer editor`), measured on 95 frames. 2026-11-04.** Examined Penpair 0.12.0 plus the render service on `perf/render-timing-profile`, against Penpot cloud, Brave on debug port 9222, macOS. One file (about 1 800 shapes on one page), one browser. Read it before building an editor-side renderer or reopening "why is export slow".

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

## Built, and what the 95-frame run showed

`export --frames … --renderer editor --debug-port PORT` and `design-release copy --pixel-renderer editor` use it. Approvals and baselines never do. On the 95 frames of a real release page: exporter at concurrency 4 took 8 min 34 s, at 8 took 15 min 31 s (the exporter handles about four at a time; its source says headless renders share one worker), the editor took 1 min 50 s. An unchanged rerun with `--cache` took 7 s once fingerprints were read in batches of 25 instead of one call per frame.

Image quality against the exporter's, same 95 frames: every size matched after rounding fractional sizes to the nearest pixel; median 1.3 % of pixels differing by more than a small threshold, worst 5.3 %, text edges almost entirely. Two things the first version got wrong and the tests now hold: the editor's floating toolbar and rulers covered a frame that sat flush against the canvas edge (fixed by keeping 120 px of free canvas around it), and a whole-pixel offset (fixed by nudging the view). Two of 95 frames never settled in one run and were reported as failed rather than returned.

Limits that remain: transparent areas come out in the canvas colour; content bleeding past the frame is cut off; frames over 8000 px are refused; only Brave on macOS at one pixel ratio, Penpot cloud; the tab must be left alone while it runs.

## Not decided or not tried

- Enlarging the viewport changes the editor under the user's hands for a moment. It is restored in a `finally`, but there is no guard against someone editing in that tab meanwhile.
- Frames larger than 8000 px need tiling; they are refused today.
- Only Brave on macOS at one device pixel ratio. Not tried on Docker or self-hosted Penpot, or in other browsers.
