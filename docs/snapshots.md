# Structural snapshots for review

```sh
penpair snapshot
penpair snapshot --write --out design/snapshots/current
penpair snapshot diff design/snapshots/before --from design/snapshots/current
penpair snapshot diff design/snapshots/before --from design/snapshots/current --out design/changes.md
```

Default mode captures for inspection and writes nothing. `--write` publishes schema-1, page-split structure and token JSON. Every page starts at the actual page root, so loose text/groups outside boards are retained. A reserved structured-inspection selector `@page-root` supports this scope. Page names must be unique for the editor's name-based selection API; ambiguity refuses rather than selecting a similarly named page.

The snapshot records file/page/node identities, hierarchy/order, geometry, full text, layout, styles, token bindings, component source IDs/overrides and explicit unknown fields, plus the typed token/theme catalog. All pages and tokens must share the same file/revision, with an independent listing afterward. Changed source, incomplete transfer or credential redaction refuses publication. Capturing can switch the current editor page; no design objects are changed, and the editor remains on the last inspected page.

Review budgets: 100 pages, 50,000 total nodes, 8 MiB per page/token artifact, 128 MiB total, five-minute collection budget checked between bounded captures. Individual captures retain I8 call/time/transfer limits. Source fields that the plugin API cannot observe remain explicit unknowns; a complete traversal does not make those fields known.

Artifacts use deterministic key/node/page order, with hierarchy indices retained. Volatile capture times and transport metrics are omitted. Identical source produces identical files. Immutable `generations/HASH/` artifacts are written first and a hash-checked `snapshot.json` pointer is published last. A local exclusive publication lock refuses competing writers. An older revision or another file cannot replace the canonical pointer. Prior generations remain available; deleting them is an owner action.

Offline `snapshot diff` validates all manifest/artifact hashes and identities, then reports added/removed pages/nodes and changed text, bindings, layout, geometry, styles, metadata and token catalogs. Foreign file IDs are not comparable. Large diffs show an explicit truncated result with an exact total change count (exit 3); full bounded comparisons with changes exit 2, unchanged exit 0. Markdown keeps design-supplied names/text inside literal untrusted-data fences. The command does not post comments or contact a forge.

These artifacts are **review evidence**, not full-fidelity backups. They do not embed external library assets, font/image bytes, collaboration history or every native feature. Keep the [archive/hosted restore workflow](backup.md) for disaster recovery; structural diffs cannot establish a successful restore. Native component override proof and live hosted round trips remain pending.
