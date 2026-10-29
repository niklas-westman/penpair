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
- **A clone of something built in the same call can lose its token bindings**, because they were not saved yet. Build, settle with the shared policy, independently observe the saved bindings, then clone; or copy bindings across in a separately verified step.

## Layout

- `flex.horizontalSizing = "fix"` on a flex child collapses it to 100 px. Keep it `auto` and set `layoutChild.horizontalSizing = "fill"`.
- Instances can keep a **fixed height** from an old layout and clip or stretch their content. Set `flex.verticalSizing` and `layoutChild.verticalSizing` to `"auto"` to hug.
- A **text box height does not recompute** when characters change; set it with `resize(width, height)` per line count. After swapping text, widths can stay stale; set an explicit width.
- `clipContent = true` on a wrapper board cuts off shadows of children that touch its edge. Set it to `false` on wrappers around cards.
- Image fills stretch by default; set `keepAspectRatio: true` on the fill.
- **`resize()` switches a board to fixed sizing.** After resizing, set `flex.verticalSizing` and `flex.horizontalSizing` back to `"auto"` on every axis that should hug; otherwise the board keeps its resized height and its content overflows it.
- **A board child set to `layoutChild.horizontalSizing = "fill"` reports `fill` for its own sizing**, and Penpair's fidelity check accepts only `auto` or `fix` for boards. Give a wrapping row of tags a fixed width with `resize` and `flex.verticalSizing = "auto"`; use `fill` on text and other non-board children.
- Layout settles slowly (seconds, sometimes 30). Use bounded layout observations before independent readback and stable exports; elapsed time alone proves nothing.

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

## Build report: hosted Penpot 2.18.4, reviewed 2026-10-21

The following observations came from the reviewed build brief. They are version-scoped reports, not new live reproductions on this branch or guarantees about another version. Preserve the symptom and workaround in a reproduction when upgrading. Recipe safeguards are tracked in the build-kit work; this reference alone does not enforce them.

### 2026-10-21 — Stretch row inside a hugging parent

Reported: `alignItems: "stretch"` produced zero height and overlapping children in this nesting. Use `start` and an explicit height for blank/fill children, then verify actual geometry and an export. Do not generalize this to every stretch layout.

### 2026-10-21 — Fill child changes a hugging parent

Reported: a child with `layoutChild.verticalSizing = "fill"` changed the parent's sizing to `fix`. Reassert `parent.flex.verticalSizing = "auto"` after building when hug is intended; read it back. A deliberate fixed parent should keep its intended sizing.

### 2026-10-21 — Fixed sizing does not assign the desired height

Reported: setting `flex.verticalSizing = "fix"` left the board at its 100 px default. Use `board.resize(width, height)` for the intended dimensions and verify the resulting box.

### 2026-10-21 — Empty text characters rejected

Reported: `text.characters = ""` was rejected. Omit an unnecessary text node, or use a non-breaking space when a blank placeholder is intentional. Confirm its dimensions and accessibility meaning in the eventual implementation.

### 2026-10-21 — Fill opacity is not a shape setter

Reported: assigning `shape.fillOpacity` failed because the object is not extensible. Use documented `shape.opacity` for the whole shape or opacity in the `fills` array for the fill. A fill-token binding can reset fill-level values, so bind after assigning values and inspect the result.

### 2026-10-21 — Formulas and existing theme membership

Reported: an arithmetic formula referencing a radius token resolved in a newly added token, and `theme.addSet(set)` added a set to an existing theme. Read `resolvedValue` under the intended active theme; this is not a portable alias-conformance claim. Use project token names, for example `{radius-base}*2`.

### 2026-10-21 — Component instance structure is restricted

Reported: removing or reordering instance children failed, while supported text/fill/token overrides worked. Choose components whose structures match the needed variants; do not treat an instance as a freely mutable group. Test supported overrides on the actual component/version.

### 2026-10-21 — Layout setters and binding keys differ

Layout uses `topPadding`, `rightPadding`, `bottomPadding`, `leftPadding`, `rowGap`, `columnGap`, `horizontalSizing` and `verticalSizing`. Token bindings use `paddingTop`, `paddingRight`, `paddingBottom`, `paddingLeft` and their documented binding keys. Keep setter names and binding names separate in recipes.

### 2026-10-21 — Component creation and saved bindings

Reported: use `penpot.library.local.createComponent([board])`; a slash-separated board name becomes component path/name. Avoid repeating the full path when renaming the component. Independently observe token bindings before component creation; an elapsed sleep alone does not prove they were saved.

### 2026-10-21 — Fonts need an actual applied face

Reported: `penpot.fonts.findByName(fontName)` found the project's Google font, and `font.applyToText(text, variant)` for the desired weight corrected the exported face. Check the font/variant exists; do not silently pick another weight. Font-token identity alone is not proof that export drew the right face.

### 2026-10-21 — Path boxes can distort glyphs

Reported: resizing a non-square path to a square stretched the glyph. Preserve its aspect ratio, scale evenly, and place it inside a fixed-size icon board when a square slot is needed. Inspect the exported result.

### 2026-10-21 — Layout remains unsettled after a build

Reported: tree/export results stayed unsettled for roughly 10–30 seconds. Use bounded native/fallback layout checks followed by independent stable exports; neither a fixed delay nor one render proves the final state. Default operation/export integration now uses these checks. Delayed token persistence and visual correctness still require independent evidence.

### 2026-10-21 — Background editor suspension

Reported: a hidden editor lost its heartbeat after roughly 6–8 minutes. Keep it visible, preferably in a separate window. That duration is an observation, not a timeout guarantee. Only declared reads retry suspension; possible writes remain uncertain and require independent inspection or explicit journal resume. Bring the editor forward before diagnosing the file.
