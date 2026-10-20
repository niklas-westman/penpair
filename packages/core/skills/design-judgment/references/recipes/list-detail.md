# Recipe: list and detail workspace

Default for screens where a person browses a set of items and inspects one. A project's own approved design replaces this recipe for the same screen.

## Applies when

The task is "find the right item, then read about it and act". One item is open at a time and the list stays visible. Choose the queue recipe when rows are compared across many columns, and an overview when monitoring is the task.

## What leads

1. The list with search and filters (finding comes first).
2. In the detail: identity and the next action. Then what is known about the item, story first: a summary, then key facts, tags, contact and links, notes.
3. Actions sit where the task ends: a footer row in the detail, the destructive one named specifically ("Delete project").

Show a field only when it has a value. An item with thin data still reads as a finished card; draw that variant as well as the full one.

## Parts

Search field, filter button, status badge (tone from the status map in `status-and-feedback.md`), avatar, a segmented control or tabs for sections of the detail, close button, skeleton, error banner, dialogs for confirmation, breadcrumb, a drawer for narrow widths. Check each against the project's component library; where it has no list or chip, compose them from its stack and badge primitives and record the gap where the project keeps its component map.

## States

List: loading (skeleton shaped like rows), empty (says what is missing and how to add one), no matches (names the filters and offers Clear), error (friendly copy, retry), more available (pagination is a decision; say so rather than hiding it). Detail: loading, error with retry, deleted by someone else, forbidden.

## Behaviour

Selection, filters and tab live in the URL; closing the detail returns focus to the card that opened it, or to the list heading after a direct link; Escape closes. Cards are reachable by Tab and open with Enter.

## Narrow widths

At 900 px and below the detail takes the whole screen (or a drawer) and the list keeps its scroll position and filters. The menu is a drawer over a scrim. A card never replaces a comparison that needs columns.

## Check

Open an item with a long name and an item with thin data at 390 and 1512 px; trigger each state; use only the keyboard; reload on a deep link and confirm selection, filters and tab survive.
