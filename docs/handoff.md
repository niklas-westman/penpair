# Derived design handoff

```sh
penpair spec --page Dashboard --frame FRAME_ID --out design/specs/dashboard.md
penpair spec --from design/inspections/dashboard.json --map design/component-map.json --out design/specs/dashboard.md
penpair spec check --from design/inspections/dashboard.json --map design/component-map.json --out design/specs/dashboard.md
```

The live command reuses the complete, bounded I8 inspection under the configured strict file guard. The offline command accepts a complete `inspect ID --page PAGE --all --out FILE` capture. Incomplete, redacted, disconnected or inconsistent trees refuse publication. The command writes only a local derived document; page switching is the usual inspection operation. `--frame` is an immutable ID; resolve names explicitly with the existing inspection tools first.

The schema-1 handoff records exact file/page/frame/revision, deterministic structured source hash and explicit mapping hash. It preserves hierarchy, layout, geometry, full text, style, token bindings, component source/overrides and per-field unknowns. A single atomically written Markdown document embeds its provenance and literal JSON evidence. Design text, names and mapping hints remain untrusted data in a safely sized fence, with bidirectional controls escaped; they never become executable JSX or agent instructions. Review unknown semantics before implementing.

An optional schema-1 component map names exact source identities:

```json
{
  "schemaVersion": 1,
  "components": [{
    "libraryId": "OWNER_REVIEWED_LIBRARY_ID",
    "componentId": "OWNER_REVIEWED_COMPONENT_ID",
    "codeComponent": "StatTile",
    "props": {"tone":"success"},
    "textProps": {"label":"EXACT_DESCENDANT_TEXT_NODE_ID"}
  }]
}
```

Names and equal pixels do not establish a mapping. There are no guessed library IDs in shipped maps: the adapter's native component catalogue awaits C1 proof. Static scalar props are owner-declared hints; text props resolve only explicit descendants of that instance. Missing text IDs stay unknown. No inferred click handlers, state transitions, keyboard behavior, accessibility roles, focus order or responsive layout claims are emitted. The current recorded state does not describe every breakpoint or theme.

`spec check` regenerates from the supplied structured capture and map, detecting manual edits, source/revision changes and mapping changes (exit 2). It does not contact Penpot or establish current live freshness. A PNG export manifest alone cannot prove structural/text freshness; use a new structured inspection rather than treating an unchanged image as proof. Live human handoff/adoption acceptance remains pending under I12; native mapping generation remains gated under C1. JSON output uses the shared command envelope.
