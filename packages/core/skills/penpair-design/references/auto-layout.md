# Flat auto-layout

## The rule

Auto layout is the default for everything built in Penpot: every group of content is a flex board that sizes to its content (`auto` hugs, `fill` stretches), so it grows when text grows.

A frame is one flat stack. The gap token between siblings carries all spacing, and no wrapper board exists only to hold spacing. A board that draws a surface (a card, chip, pill or panel) carries its own padding as the inset of that surface. In code this is the library's stack primitive with a gap token; in Penpot it is a board with flex layout. A person's own wording of the rule is usually "auto-layout with the same gap between each element, not spacing layered in a folder structure".

## Generated output

Code that creates Penpot shapes (renderers, release pages, map cards, plugin snippets) follows the same rule as a built screen: a text column, a row of tags, a card or a notes section is a flex board, and its size comes from its content, never from an estimate.

- Position absolutely only what flex cannot hold: connectors between nodes, and art that bleeds off an edge. Add a comment saying why.
- Read measured sizes after layout settles (`waitForLayoutUpdate`), and place whatever follows from those, so later content follows the real height.
- Stress the result: export with a deliberately long title and long text, and look at the image twice. A wrapped title that lands on the next element means a fixed position slipped in.
- API traps are in [penpot-plugin-gotchas.md](penpot-plugin-gotchas.md#layout).

## Mapping

| Layout primitive in code | Penpot flex board |
| --- | --- |
| Column or row stack | `flex.dir = "column"` or `"row"` |
| Gap token | `rowGap` and `columnGap` bound to the spacing token |
| Padding tokens | `paddingTop/Right/Bottom/Left` bound to spacing tokens |
| Align | `flex.alignItems` (`start`, `center`, `end`, `stretch`) |
| Justify | `flex.justifyContent` |
| An item that grows to the width | child `layoutChild.horizontalSizing = "fill"` |
| A content-sized item | `"auto"` (hug) |
| A fixed size | `"fix"` |

Use `fill` for children that stretch to the column (fields, buttons) and `auto` for content-sized ones (a back link, left aligned).

## Responsive

Recompose, then shrink. Master and detail: the list is the screen and opening an item replaces it with the detail. Headers: keep what identifies the person and the page, drop what repeats; swap a wordmark for the logo mark before hiding the name. Menus: a drawer over a scrim. A popover can become a floating sheet. Reuse the approved frames by cloning, changing sizing (`fill` instead of fixed widths) and removing what does not belong, so content, tokens and components stay the approved ones.

## Applying a change

1. Change the Penpot frame or the component main (see write-protocol.md).
2. Export the frames and read the geometry again.
3. Change the code to match, then run the project's pixel check.
4. Update only the tests whose numbers came from the old layout, with values read from Penpot.
