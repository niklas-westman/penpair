# Named exports and ad-hoc shots

```sh
penpair export --name "Dashboard / Desktop" --page Dashboard dashboard.png
penpair export <shape-id> dashboard.png --page Dashboard
penpair shots --page Dashboard --prefix "Dashboard /" --out design/shots
```

Names match exactly on the selected page, including nested shapes. Zero matches or multiple matches fail; ambiguity reports candidate IDs instead of silently choosing one. Names shared by multiple pages are also refused for name-based page selection. Use an ID when the shape name is ambiguous. The name search visits at most 10,000 nodes and refuses incomplete lookup. A lookup's file/page/revision must still match the stable export before bytes can be published.

`shots` selects top-level frames with an optional prefix. It reuses the stable PNG exporter and the capture identity checks. It supports up to 100 selected frames per run; narrow the prefix for larger pages. Empty or unstable selections exit 3 and publish no new manifest. Intervening edits or export failure preserve the previous complete manifest. `--out` is project-relative and cannot escape through a symlink. With no config, built-in capture supports explicit `--standalone`.

The output contains immutable `captures/<run-id>/shot-0001.png` images and a `penpair-shots.json` manifest, published after every capture succeeds. Each entry records the original name, target IDs, revision, PNG dimensions/hash and available render environment. No baseline approval is created. Old generations remain usable; review references before cleaning them. Interrupted local publication can leave an unreferenced generation, as described in [artifact publication](artifacts.md).

Use `--json` for the shared command envelope. Unknown option errors suggest a nearby spelling when one is plausible, but never reinterpret or execute the suggestion. Named exports keep the existing scale option, and `shots` accepts it too. Stable bytes and geometry are technical capture evidence; review the resulting images before judging visual correctness.

## Several frames at once

```sh
penpair export --frames ID1=login-desktop,ID2=login-tablet,ID3 --page Candidate \
  --out design/exports --cache
```

Each entry is a frame ID with an optional file name (`ID=NAME`, written to `OUT/NAME.png`; the default name is the ID, the default folder `design/exports`). Frames are rendered together, `--concurrency N` at a time (1–8, default 4), each with the same stable-render rule as a single export: two renders that must match byte for byte. A frame that fails is recorded with its reason and the batch goes on, so one bad frame does not cost the others; the exit code is 1 when any frame failed. The JSON report lists each frame as `exported`, `cached` or `failed` with its time, and a summary. One progress line per frame goes to stderr.

`--cache` skips a frame that is unchanged since its last export. Before each frame Penpair reads a fingerprint of the board: the visible properties of every shape under it (geometry, fills, strokes, effects, radius, text content and font settings, layout and sizing, applied tokens) plus the active token values and themes. A frame is skipped only when that fingerprint, the scale and the file/page match the cache entry in `.penpair/export-cache.json` **and** the output file still has the bytes recorded then. A removed or hand-edited output file, a changed token value, a truncated sample (more than 20,000 shapes) or a missing entry exports again.

The fingerprint is not a pixel proof: image bytes, fonts that loaded differently and properties outside the list are not read. Use the cache to avoid re-exporting boards you did not touch (an evidence run in which most frames are unchanged); do not use it for baselines or approvals, which keep their own full captures. A cached frame is reported as `cached`, never as freshly exported, so look at the exports that matter.

## How long it takes, and how to tune it

Penpot's exporter costs about 5–10 s per render request whatever the frame size, and it runs a few requests in parallel. That is why `--concurrency` matters up to a point, and why the stable rule (two matching renders) doubles the time of a first run. Each single-frame `export` prints a `timing` line and returns `timing` in its result: layout, stability wait, hashing, and for every render the whole round trip next to the time spent inside Penpot's own export call.

Measured on 95 frames (a real release page, Penpot cloud, one afternoon):

| Route | First run | Unchanged rerun with `--cache` |
| --- | --- | --- |
| Exporter, `--concurrency 4` | 8 min 34 s | 27 s, then 7 s once fingerprints were batched |
| Exporter, `--concurrency 8` | 15 min 31 s | 1 min |
| Editor (`--renderer editor`) | 1 min 50 s | 7 s |

Recommendations, in order:

1. Keep the default of 4. The exporter handles about four renders at a time, so more concurrency queued and was slower, not faster. Raise it only after timing your own Penpot.
2. Use 2 (or 1) after you see "http error", a frame falling back to a single render, or a stalled run. Penpot's render endpoint is the part that fails under load.
3. A render that never answers ends the run: the unfinished frames are named and reported as failed, and nothing after the stall is attempted, because a call that timed out still holds the editor and everything after it would only queue behind it. Run again with `--cache` and the frames that were rendered are kept.
4. `--cache` makes the second run cheap. It reads a fingerprint of every frame through the plugin in a few calls of up to 25 frames each, so a page of 95 unchanged frames takes seconds.
5. For many frames where the exporter's exact bytes are not needed, render from the editor (next section).

## Rendering from the open editor

```sh
penpair export --frames ID1=login-desktop,ID2=login-tablet --page Candidate \
  --renderer editor --debug-port 9222
```

`--renderer editor` captures each frame from the open Penpot tab instead of asking the exporter, so a frame takes about a second. Penpair shows the frame at 1:1 (at `--scale` times the pixels) with 120 px of free canvas around it, so the editor's toolbar and rulers never cover it, clips exactly its rectangle (a fractional size rounds to the nearest pixel, as the exporter does), and returns the image only when two captures in a row are byte-identical. It needs `--debug-port` for a Chromium-based browser started with remote debugging, the pinned file open in a single tab, and the project's file pin. It writes no design data; it moves the editor's own viewport and window size for the capture and puts both back afterwards, so do not use that tab while it runs.

An editor image is a different pipeline from the exporter's. Measured on the same 95 frames, every image had the exporter's size; the median image differed from the exporter's in 1.3 % of its pixels by more than a small threshold, the worst in 5.3 %, almost all of it text edges. Anything that bleeds past the frame is cut off, and transparent areas (the corners of a rounded frame, for example) come out in the canvas colour. Two of the 95 frames never settled in the first run ("the canvas kept changing") and were reported as failed; the rerun captured them. So:

- Its results are labelled `renderer: editor-screenshot`, and its cache entries are kept apart from the exporter's.
- Use it for review, for noticing that a frame changed, and for comparing two frames rendered the same way. Do not use it for baselines or approvals; `approve` and `baselines` always use the exporter.
- A frame larger than 8000 px on a side is refused with a pointer to the exporter. There is no silent fallback between the two renderers, because that would mix their images in one set.

## Approving many frames

```sh
penpair approve --page PAGE --frames frames.json
penpair approve --page PAGE --frames frames.json --write --note "OWNER WORDS" --by OWNER
```

`frames.json` is an array of frame IDs, or of `{ "frame": ID, "case": CASE_ID }` for frames with a configured approval case. Every frame is checked against its case exactly as a single approval is, rendered together with the same stable double render, and previewed. With `--write`, one `--note` and `--by` (the owner's exact words, which then cover the whole list) record every frame. Nothing is written unless every frame rendered, stabilised and matched its case, so a batch never half-approves; the report lists what failed. The frames must be on one page. Approvals never reuse an earlier image and never use editor screenshots.
