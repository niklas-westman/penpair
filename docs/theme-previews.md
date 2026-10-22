# Isolated projected theme previews

```sh
penpair marwes tokens preview --from design/tokens.json --theme Light
penpair marwes tokens preview --from design/tokens.json --theme Mode/Dark --out design/dark-preview.json
```

This is an **offline projection** of declared values. The adapter reads the retained snapshot without importing the installed application theme or connecting to Penpot. Output is schema 1, `kind: projected-theme-preview`, with a hash of the source artifact, its declared snapshot hash, selected theme/set identities and catalog order, resolved values, explicit unknowns, `complete` and `nativeBindings:false`. Missing native IDs remain null; names are not invented IDs.

Later sets in catalog order win, regardless of the theme membership list order. Aliases, numeric expressions and structured values use the same neutral resolver as adapter mode verification. Missing sets/ambiguous names refuse; missing aliases, cycles, unsupported units/types or budget excess remain unknown (exit 3). A complete projection exits 0. Output paths stay within the project, refuse overwrites and cannot replace the source. Projection does not validate color meaning, layout, fonts or native component anatomy.

See the [owned scratch example](../examples/theme-preview/README.md) for two independent color previews. Projected fills carry separate provenance and are not native color bindings. Existing typography/spacing/radius bindings require their own independent readback.

## Pinned native capability evidence

Inspected on 2026-10-22 against repository-pinned **Penpot 2.18.3**. The [pinned token implementation](https://github.com/penpot/penpot/blob/2.18.3/frontend/src/app/plugins/tokens.cljs) activates themes/sets in the file token library. The [pinned shape implementation](https://github.com/penpot/penpot/blob/2.18.3/frontend/src/app/plugins/shape.cljs) exposes token application by token and property. The [official Theme reference](https://doc.plugins.penpot.app/interfaces/TokenTheme) describes active set membership and grouped activation. These contracts do not establish an independently selected theme per frame. This is source-based evidence, not a live runtime capability proof.

The adoption report observed hosted API 2.18.4, which is distinct from the pinned Docker runtime. No frame-level theme setter has been verified on either runtime here. Native per-frame color binding, native component parity and override preservation therefore remain unclaimed. A future live capability trial must inspect the actual API, change only owned scratch roots and prove unchanged global selections/catalog/order and unrelated objects. A method name or projected appearance is insufficient.
