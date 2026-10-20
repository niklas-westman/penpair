# Penpot plugin traps (API 2.18.x)

Each one cost real time. They are written as the behaviour to use. Penpot 2.18.3 (local) and 2.18.4 (hosted) were both checked unless a line says otherwise; `docs/compatibility.md` in the penpair repository has the matrix.

## Structure

- **Edit a component main; never restructure a copy.** `appendChild` and similar are refused on a component copy. To change structure, edit the main (children move with `parent.insertChild(index, child)`), then remove the emptied wrapper. A copy accepts text, fill and token overrides, and a component swap.
- **`main.clone()` returns a copy placed in the main's parent**, so it cannot be restructured either. Build a new component from primitives instead.
- **A library component's name is split into a path and a name.** Shapes named "Group / Part" become a component with path "Group" and name "Part". Create the component and leave its name; setting the name to the full text afterwards makes the main shape "Group / Group / Part".
- **Create from primitives** (`createBoard`, `createText`, `createEllipse`, `createPath` with a string `content`, `createRectangle`). `createShapeFromSvg` lands wherever the editor last worked, often inside a button copy. A new path appears at the origin; set its `x` and `y`.
- **New shapes land where the editor last worked.** Append explicitly to the intended parent and position them.
- **Shapes cannot move between pages**, and `clone()` works only within the page. To put old work aside, nest it in an archive board on the same page (`penpair archive`).
- **Wrapper objects are new on every read.** Look shapes up by `id`; `indexOf` on wrappers returns -1.
- **Nested shapes inside an instance also answer `isComponentInstance()`.** Take the top-most instance (the one with no matched ancestor) when you count or replace.
- **A clone of something built in the same call can lose its token bindings**, because they were not saved yet. Build, wait, then clone, or copy the bindings across in a second step.

## Layout

- `flex.horizontalSizing = "fix"` on a flex child collapses it to 100 px. Keep it `auto` and set `layoutChild.horizontalSizing = "fill"`.
- Instances can keep a **fixed height** from an old layout and clip or stretch their content. Set `flex.verticalSizing` and `layoutChild.verticalSizing` to `"auto"` to hug.
- A **text box height does not recompute** when characters change; set it with `resize(width, height)` per line count. After swapping text, widths can stay stale; set an explicit width.
- `clipContent = true` on a wrapper board cuts off shadows of children that touch its edge. Set it to `false` on wrappers around cards.
- Image fills stretch by default; set `keepAspectRatio: true` on the fill.
- Layout settles slowly (seconds, sometimes 30). Poll geometry or wait before reading or exporting.

## Tokens

- **A token binding is recorded after the call, not during it.** On the hosted Penpot it appeared after half a second to a few seconds; reading it straight away shows nothing. Wait, then read `shape.tokens`.
- **Applying the same token again removes it.** Read `shape.tokens` first and apply only what is missing.
- **Assigning a value drops the binding**: setting `flex.rowGap` unbinds `rowGap`. Bind after setting values.
- **A changed token value does not re-resolve bound shapes.** For typography apply another token and then the target in two separate steps, and for shadow unbind and then apply again. A font family set through a token needs `font.applyToText(text, variant)` on the text so the exporter draws the face; otherwise it falls back to a serif.
- **Binding keys:** radius = `borderRadiusTopLeft`, `borderRadiusTopRight`, `borderRadiusBottomRight`, `borderRadiusBottomLeft`; text = `typography`; stroke = `strokeColor`; shadow = `shadow`; fill = `fill`; spacing = `rowGap`, `columnGap`, `paddingTop`, `paddingRight`, `paddingBottom`, `paddingLeft`. A token must be in an **active set** to resolve.
- **A new token set may start inactive** (seen on the hosted Penpot, in a file with no themes). Check `set.active`.
- Token values are objects for typography and shadow: `fontFamily` is a list (`["Inter"]`), shadows are arrays of `{offsetX, offsetY, blur, spread, color, inset}`.
- Set order decides: the later set wins, so project overlays stay last. Promoting experimental sets into the real ones is safe when the merged values come out identical in every theme; `penpair tokens diff` compares exactly that.

## Connection

- **The plugin tab must be active and visible.** A paused tab fails every script ("no heartbeat"). Ask the person to bring the tab forward, then read the page before running a write again.
- **A request is limited to about 100 KB** (90 KB accepted, 110 KB refused, on both local and hosted). Responses of a megabyte or more return fine.
- **`penpot.openPage` switches the person's editor view and takes effect only after the script ends.** Run the next snippet afterwards.
- **`currentFile.export("penpot")` fails** with "No matching clause" in 2.18.3 through the MCP. A portable `.penpot` file comes from the editor's File menu.
- **Exports can fail once and then work, and can be stale right after a write or a page switch.** Export again, and compare two in a row.
- The MCP key is personal, one per account, shown once. A key for another instance silently drives another file; penpair refuses it unless told otherwise.
- A snippet receives data only through its parameters; it cannot read repository files.
- **Token values can be changed in place** (`token.value = ...`, `token.description = ...`), and `token.remove()`, `set.remove()`, `theme.addSet(set)`, `theme.removeSet(set)` and `theme.remove()` all work. **Not for a typography token:** creating one normalises it (`fontFamilies: "Inter"` becomes `fontFamily: ["Inter"]`), but assigning a new value stores the object as given, un-normalised. Remove the token and add it again, and compare typography values in their normalised form. (Checked on Penpot 2.18.4, hosted.)
- A new token set is inactive and a set's `resolvedValue` is null until a theme activates it; a file with no active theme resolves no tokens at all.

## Rendering differences to design for

- Penpot draws a shadow blur harder than CSS: a token blur 12 at 10 % looks like CSS `0 0 8px 4px` at 10 %. Fit the CSS to the exported frame and keep the mapping in a parity test.
- Text widths differ a few percent between Penpot and the browser; compare with a pixel check, not by eye.
