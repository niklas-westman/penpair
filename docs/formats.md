# Versioned formats and portable tokens

`penpair formats schema NAME` emits a JSON Schema envelope for `project-config`, `command-result`, `inspection`, `component-map`, `design-spec`, `approvals`, `structural-manifest`, `baseline-manifest` or `portable-tokens`. Adapter-owned schemas come from `marwes tokens schema` (v2) and `marwes components schema` (v1). Schema IDs are stable URNs, not hosted download endpoints. Runtime validators additionally check identity, hashes, hierarchy, complete observations and byte budgets; passing an envelope schema alone does not prove evidence valid.

Unversioned project config is legacy v1. Explicit `schemaVersion:1` is supported; other major versions refuse with migration advice. Adapter blocks remain intact. `formats migrate-config OLD_JSON --out NEW_JSON` previews/copies a supported legacy config to v1 and preserves unknown blocks. Outputs are exclusive new files: inspect/diff before replacing a project input. No in-place rewrite or live design edit occurs.

The token adapter's `tokens migrate --from OLD_JSON --ownership SET_OWNERS_JSON --out NEW_JSON` upgrades a schema-1 snapshot with an explicit ownership decision for every set. The owners JSON maps exact set names to `adapter` or `project`; names alone never infer ownership. It preserves source fields, validates tokens/membership and computes the schema-2 hash. Review against freshly generated declarations before pushing. Other unsupported artifact majors require producer-specific migration guidance; they are not guessed or silently overwritten.

## Published token exchange subset

```sh
penpair formats import-tokens design/input.tokens.json --out design/portable.json
penpair formats export-tokens design/portable.json --out design/output.tokens.json
```

This is a deliberately limited, validated subset of [DTCG Format 2025.10](https://www.designtokens.org/TR/2025.10/format/) and [Color 2025.10](https://www.designtokens.org/TR/2025.10/color/). It supports nested groups and inherited types; descriptions/extensions; whole-token curly-brace aliases; number; numeric font weight; font families; px/rem dimensions; numeric sRGB/display-p3 color components; and composite typography with typed field aliases. Explicit units, color space, ordered font families and alias paths survive exchange. Alias cycles, missing references and incompatible types refuse.

The version-1 portable artifact retains typed values, paths, group metadata and explicit losses. Supported conversions are lossless and report an empty losses list. Unsupported input is rejected before output; it is never silently omitted. Bounds are 8 MiB input, 10,000 tokens, 32 group levels and 64 alias levels. This is offline exchange, not a Penpot token-set importer or an implementation of the complete DTCG resolver specification.

Outside this subset: JSON Pointer/property references, group extensions/inheritance, deprecated metadata, root tokens, other composite types, named weights, nonnumeric color components, additional color spaces and native Penpot arithmetic expressions. Formula evaluation and px/rem conversion are intentionally absent: the tool preserves units rather than choosing a root font size. Native token snapshots retain their own richer values and formulas; using this exchange subset does not claim full standards conformance.

`projected-theme-preview` v1 records deterministic offline values, source/theme/set identity and explicit unknowns; `nativeBindings:false` distinguishes it from live binding evidence. See [theme previews](theme-previews.md).
