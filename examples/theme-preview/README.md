# Projected theme scratch example

Generate independent light/dark artifacts with `penpair marwes tokens preview --from SNAPSHOT --theme NAME --out NEW_FILE`. The selected theme is resolved offline; no active flags are changed. Inspect each artifact's `complete`, `unknowns`, source hash, theme and ordered sets first.

These reviewed example bodies accept literal `CFG.preview` JSON, `CFG.color` token name, `CFG.rootId` and `CFG.marker`. Each target must already be a confirmed disposable, owned scratch root with `getSharedPluginData("penpair","owner") === marker`. Do not adopt an existing design root implicitly. Prepare separate light and dark roots and inspect/pin the source before any apply.

Use the normal `prepareFileScript`/`runFileScript` API with:

```js
const prepared = await prepareFileScript(projectRoot, 'preview/apply.js', {
 page: 'Scratch', include: ['preview/helpers.js'],
 inspect: 'preview/inspect.js', readback: 'preview/readback.js',
 params: { preview: JSON.stringify(previewArtifact), color: 'surface', rootId, marker },
});
await runFileScript(client, prepared); // review inspection first
// Within the authorized scratch scope, apply once with a private journal and independently verify.
```

The example sets one opaque projected fill directly and records `kind`, source hash, theme/sets and projected property provenance under a separate `projection` metadata key. This **removes any fill binding** and must not be reported as native per-frame theme binding. Typography/spacing/radius bindings remain real, independently inspected bindings. The example refuses unsupported colors and partial projections; it does not guess gradients, opacity or token semantics.

After applying, compare catalog definitions/order, global theme/set selections and unrelated objects against the pinned pre-write inspection. Look at two stable exports. Repeating must preserve IDs, bindings outside fill and the same provenance. Live acceptance of this example remains pending; it is covered by sandbox-body tests only.
