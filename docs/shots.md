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
