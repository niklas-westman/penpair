# Copy boards between pages

Penpair currently cannot copy or move an existing board between pages through
the Penpot plugin API. There is no `copy-boards` command. Use native copy/paste
in the Penpot editor, leaving the originals in place, then independently inspect
the destination and compare stable exports. Keep component references, token
bindings, sizes and child counts intact. See [design release assembly](design-releases.md)
for its additional fidelity requirements.

## Tested API boundary

A disposable two-page probe on local Penpot 2.18.3 on 2026-10-25 tested a board
with one rectangle child. Each `clone()` stayed on the source page. Appending or
inserting the clone into a board on the other page failed with:

```text
Cannot modify a page that is not currently active
```

Both `appendChild(clone)` and `insertChild(0, clone)` failed with either the
source page or the destination page active. Independent readback found both
clones on the source page, no destination children, and the original board and
child unchanged. Two destination exports were inspected and showed the empty
board. Both disposable pages were removed; a separate read confirmed their
absence and the original pages' names and top-level shape IDs were preserved.
This establishes a local API limitation, not hosted-version or component/token
copy fidelity.

The [upstream shape implementation](https://github.com/penpot/penpot/blob/develop/frontend/src/app/plugins/shape.cljs)
checks that both parent and child pages are active before either structural
operation. The [Board API](https://doc.plugins.penpot.app/interfaces/Board)
provides cloning and reparenting, but no cross-page transfer operation. The
[File API](https://doc.plugins.penpot.app/interfaces/File) exposes export,
validation and history, without a file-change submission method.

## File-change route

Penpair's connection calls the editor's MCP tools; it has no authenticated
Penpot backend file-change client or supported plugin method for submitting raw
file changes. Internal `$page` metadata does not provide that capability.
Changing a proxy's internals, reconstructing a board from its visible properties,
or patching backend file objects would not establish preserved component
overrides, token bindings, references, undo behavior or revision coordination.

There is therefore no safe file-change route in the current implementation.
Automatic cross-page copying stops at this boundary. A future supported transfer
API or separately validated native editor integration would need exact source
selection, a dry run, journaled recovery, independent fidelity readback and stable
exports before shipping a copy command. Moving must remain explicit.

For large pages, scope a writer's layout observation with repeatable
`--layout-root <shape-id>` and, when needed, `--layout-max-nodes <n>`; see
[layout settling](layout-settling.md). Reducing the observation scope does not
add a cross-page copy capability.
