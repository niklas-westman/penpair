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

Each entry is a frame ID with an optional file name (`ID=NAME`, written to `OUT/NAME.png`; the default name is the ID, the default folder `design/exports`). Frames are exported one at a time with the same stable-render rule as a single export. A frame that fails is recorded with its reason and the batch goes on, so one bad frame does not cost the others; the exit code is 1 when any frame failed. The JSON report lists each frame as `exported`, `cached` or `failed` with its time, and a summary. One progress line per frame goes to stderr.

`--cache` skips a frame that is unchanged since its last export. Before each frame Penpair reads a fingerprint of the board: the visible properties of every shape under it (geometry, fills, strokes, effects, radius, text content and font settings, layout and sizing, applied tokens) plus the active token values and themes. A frame is skipped only when that fingerprint, the scale and the file/page match the cache entry in `.penpair/export-cache.json` **and** the output file still has the bytes recorded then. A removed or hand-edited output file, a changed token value, a truncated sample (more than 20,000 shapes) or a missing entry exports again.

The fingerprint is not a pixel proof: image bytes, fonts that loaded differently and properties outside the list are not read. Use the cache to avoid re-exporting boards you did not touch (an evidence run in which most frames are unchanged); do not use it for baselines or approvals, which keep their own full captures. A cached frame is reported as `cached`, never as freshly exported, so look at the exports that matter.
