# Build kit and recipes

`penpair run-file ... --include @kit` defines the neutral plugin namespace `pp`. The library exports the same plain JavaScript text as `kit()`; concatenate it into a guarded snippet rather than importing Node code into the plugin. Inclusion defines functions and recipes without touching the document.

```sh
penpair kit check
penpair recipes
penpair kit check --include @kit --include @marwes-kit
penpair recipes --include @kit --include @marwes-kit
```

The last two examples require the token adapter configured in the adopting project. A normal core check/list or `@kit` include does not import unrelated adapters. Explicit extension aliases load configured trusted adapter code to discover their source. Dependencies must appear earlier in include order; ambiguous aliases or recipe names refuse. Each kit is at most 32 KiB and combined kit source at most 48 KiB, leaving room within the final wrapped 90 KB snippet guard. Reports retain bytes and source hashes.

## Neutral helpers

| Helper | Contract |
| --- | --- |
| `tok(name)` | Reads current active sets in catalog order; later active sets win. Missing names and duplicates inside a set refuse. No inactive-set fallback or persistent cache. |
| `bind(shape, name, properties)` | Queues explicit token-property bindings for `flush`; properties are token binding keys, not arbitrary JavaScript shape fields. |
| `box(parent, options)` | Makes a flex board; `gap` and four-sided `pad` accept spacing token names or unbound zero. `w`/`h` are explicit geometry. `bg`/`stroke` are color tokens and `radius` is a radius token. |
| `text(parent, value, options)` | Requires nonempty characters, `typo` and `color` tokens; preflights an exact font family/weight/style and applies the face before bindings. Use `wrap`, `fill`, `grow`, `align` and explicit `font` where needed. |
| `icon(parent, kind, color, size)` | Square wrapper around a uniformly scaled path on a 24-unit drawing grid. Built-ins: chevron, check, alert, calendar. A custom glyph supplies `path` and `[x,y,width,height]` bounds. |
| `dot`, `rule` | Small geometric helpers with explicit color tokens. Intrinsic one-pixel rules/strokes are geometry, not inferred library measurements. |
| `inst(parent, path, name, textOverrides, library?)` | Exact unique component match; validates named text overrides and never removes/reorders instance children. Defaults to the local library. |
| `style(shape, options)` | Queues requested styling only; an isolated color update preserves existing spacing and bindings. |
| `fill`, `fillV` | Sets layout-child horizontal/vertical fill sizing. |
| `settle(root, options)` | `strategy: auto | native | geometry`, default auto. Auto caps native at min(500 ms, remaining/4), then requires three complete equal geometry/hierarchy samples. Time/node/malformed evidence cannot report stable. |
| `flush({root, timeoutMs, strategy})` | Waits for layout, applies queued values/styles, then awaits queued bindings, then settles again. Active token-context changes refuse. |

Always `await pp.flush()` before independent readback/export. There are no fixed 1.2/2.5-second styling sleeps. Layout completion does not prove font download, token persistence or pixels; keep positive readback and stable exports. Queues are local to one execution, not a recovery log. Partial errors are not transactions; the enclosing reviewed operation must own and reconcile its roots. Bindings remain subject to the runtime's supported token properties; A4 owns the broader compatibility whitelist.

Example body (inside a reviewed `run-file` operation):

```js
const card = pp.recipe("hello-card", ownedRoot, {
  box: { name: "Hello card", w: 240, gap: CFG.space, pad: [CFG.space, CFG.space, CFG.space, CFG.space], stroke: CFG.color, radius: CFG.radius },
  text: { typo: CFG.typo, color: CFG.color },
  label: "Hello, card",
});
await pp.flush({ root: ownedRoot });
```

A recipe is registered with `pp.defineRecipe(name, (parent, props) => shape, description)` and invoked through `pp.recipe`. Recipe source must remain synchronous at construction time; asynchronous binding/layout work finishes in `flush`. See the [complete repeatable example](../examples/hello-card/README.md).

## Adapter recipes

`@instances`, included after `@kit` (`--include @kit --include @instances`), adds helpers for component instances. It is neutral and extends `pp`:

- `pp.componentName(instance)` returns `{ id, path, name, full }`; `component().name` alone does not carry the path.
- `pp.swap(instance, "Path / Name", { keepText, keepSize, allowTextMismatch, library })` creates the new component's instance first, puts it at the old one's index, carries the texts in reading order (`keepText`, default on) and the size or fill sizing (`keepSize`, default on), then removes the old instance. If the text counts differ it keeps the original and throws, unless `allowTextMismatch` is set. A missing or ambiguous component also leaves the original in place.
- `pp.iconSize(instance, px)` resizes an icon instance and scales its nested shapes, which a plain `resize` can leave at their old size (an instance resized smaller than the path inside it). It returns `{ scale, nodes, scaled, overflow }`; `overflow` is true when a nested shape still leaves the instance box. Stroke widths are not scaled; export and look at the result.
- `pp.libraryIcon(parent, "Path", "Name", colorToken, size)` places a library icon instance, sizes it with `iconSize` and binds the colour token on its inner stroked or filled shapes (a bind needs `pp.flush`). It throws when nothing inside can be recoloured.

These helpers run against Penpot's plugin API as the fixture models it; check a first use on a scratch board. Not included: a radius-token listing in the `radius needs a token name` error, which would not fit the core kit's 32 KiB budget.

`@marwes-kit`, included after `@kit`, defines `mw.card`, `mw.segmented`, `mw.progress`, `mw.iconTile` and `mw.statTile`, and registers corresponding recipe names. Library token defaults live entirely in the adapter; every token can be retargeted through props. Card/progress/tile radius tokens are explicit project declarations or measured inputs. Progress additionally requires an explicit **sizing** height token, since spacing tokens do not bind height. Tile dimensions and content are explicit.

These are compositional starting points. They are not generated native component variants or measured parity claims; C1 owns that calibration. Missing library defaults fail visibly rather than producing silently unbound styling.

## Opt-in scratch probe

`penpair probe --deep --kit --write` adds a journaled kit trial to the ordinary deep probe. Use an owner-authorized scratch file with active color, typography, spacing and radius tokens and the typography's font available. The trial builds a small “Hello, card” under a directly owned temporary root, observes text/bindings/geometry, exports matching renders, removes only that root, and independently compares the original page/token state. Unsupported context refuses; failed export still attempts owned cleanup. Explicit resume is allowed only against the original source and clean/reconciled state.

A verified trial saves a private PNG preview under `.penpair/probes/`, with byte hash and capture identity. Look at the preview as the write protocol requires. `visualApproval: false` remains explicit. Redacted/incomplete evidence cannot publish a preview; an existing differing preview is preserved. No new live pinned-version trial has been performed in this branch.

Current references: [flex layout](https://doc.plugins.penpot.app/interfaces/FlexLayout), [font application](https://doc.plugins.penpot.app/interfaces/Font), [component instantiation](https://doc.plugins.penpot.app/interfaces/LibraryComponent), [spacing properties](https://doc.plugins.penpot.app/types/TokenSpacingProps) and [sizing properties](https://doc.plugins.penpot.app/types/TokenSizingProps). Runtime capability and independent evidence remain required.

Host operations retain a 30 s total layout deadline; kit settle/flush default to 10 s. `native` reports failure without fallback; `geometry` skips native waiting. Diagnostics include the chosen strategy, native outcome, fallback reason and elapsed time. Neither transport loss, cancellation, changed target nor malformed/truncated data becomes a successful fallback. `run-file`, `export` and `shots` accept `--layout auto|native|geometry`. The default is suitable for ordinary builds; there is no CLI off mode.
