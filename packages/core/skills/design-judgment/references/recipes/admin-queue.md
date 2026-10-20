# Recipe: queue of decisions

Default for screens where a person works through a queue of requests and decides on each. A project's own approved design replaces this recipe for the same screen.

## Applies when

The task is "which request needs a decision next, and what is the decision". Rows are compared on status, age and sender. Use the list-and-detail recipe when the items are things being researched.

## What leads

1. Scope and status: tabs or a segmented control by status (the one needing action first), search, and the count of what needs action.
2. The queue: one row per request with the fields that decide it (who, where from, how it arrived, age, status).
3. The decision: approve and decline are the row's actions. Decline names what it sends or does; approve asks for the choices it needs.

## Parts

Tabs, search field, filter button, status badge, a context menu for row actions, a drawer for a request's detail, a dialog for approve with choices, a destructive dialog for decline, an error banner, a toast for a completed decision. Where the library has no table, compose rows from its stack, keep columns aligned with one shared set of widths, and record the gap.

## Three action scopes

Collection actions (refresh, export) in the toolbar; selection actions in a bar that appears when rows are selected, single-row actions pause meanwhile; one-request actions in the row menu. Test it: select three rows and say which actions apply.

## States

Loading, nothing pending ("All caught up", distinct from "Nothing matches your filters"), error, a failed step with a retry, a decision that failed (the row keeps its place and says why), forbidden (what a person may see is decided by their role; the screen shows structure, never content they may not read).

## Narrow widths

A row keeps who, status and the primary action; the rest moves into the drawer detail. The table scrolls on purpose when cross-row comparison matters.

## Check

Fixtures for each state; approve and decline by keyboard only; confirm the wording of anything sent appears before it is sent; long names wrap without hiding the distinguishing part.
