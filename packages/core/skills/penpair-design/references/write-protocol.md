# Writing to Penpot, and approvals

## The pattern for every write

1. **Inspect (read-only).** A write snippet or operation runs its `inspect` phase first and says what it would touch and what state it expects. Nothing is written without `--apply`.
2. **Pin.** When a change depends on what you saw, pass that snapshot back and refuse if the source differs ("source changed since inspection").
3. **One write.** Check that the place is free and the names do not exist, write once, record every id it makes. A write snippet must be safe to run again: what already exists is left alone.
4. **Read back the real objects**, not the snippet's own numbers: sizes, positions, token bindings, component names. Token bindings and layout settle after the call, so use the bounded native/fallback settling evidence before independent readback.
5. **Look at an export**, and look twice: the first export after a write or a page switch can be a stale render. `penpair export` takes exports until two in a row are identical.
6. **Never retry blindly.** After an uncertain write, inspect the actual objects and original journal, then explicitly reconcile what is really there; cleanup targets only independently confirmed owned IDs when needed. A "suspended tab" error, or a cut-off tool output, can hide a write that did complete.
7. **Approval.** The owner approves the exact list or frames. Record an approval only on the owner's explicit words and keep those words in the record. Reviews are the owner's decision; an agent does not write them.

## Order of authority

The Penpot design, then the component library, then the code. When a value looks wrong in Penpot, propose the fix in Penpot first and ask for the exact approval; do not ask whether to change the design or the code.

## Writing a snippet the protocol accepts

A write snippet has three parts: `inspect` (looks, returns what would change), `apply` (changes once, idempotent), `readback` (looks again from scratch and returns explicit observations). Supply an explicit `verify` callback, or return `verification: { expected: { count: 2 }, actual: { count: measuredCount } }` with nonempty expected/actual objects. Every phase returns `ok: true`; a missing result or an empty `problems` array cannot establish success. A nonempty `problems` array reports failure. Name everything the snippet makes so a leftover can be found and removed by hand. See `penpair snippets` and `defineSnippet`.

## Suspended tabs and lost responses

Only declared reads may retry automatically. Writes and unclassified plugin code run once. If a write reports `write-uncertain`, keep its run ID, independently inspect the pinned file, and reconcile what already exists before explicitly resuming. A run ID is a diagnostic reference, not an exactly-once guarantee. Successful execution (`ran`) still needs independent verification.

## Interrupted operations

CLI writes persist local run evidence before mutation. Inspect `penpair runs <run-id>` after failure; resume the original command only with explicit `--apply --resume <run-id>` and unchanged inputs. Resume independently checks actual state and stops on conflict. Never delete evidence to force a replay. `--checkpoint` requires a verified native version before operation steps; keep it on resume. Checkpoints are not transactions or independent backup restore proof. See the project recovery guide for limits.

## Shared files

Run `penpair onboard` for the personal-key colleague checklist. Journaled CLI writers acquire local locks and optional shared advisory markers. Coordinate with people: shared read/write markers are not atomic distributed locks and human edits remain possible. A stale revision or source observation stops the mutation. Inspect the named run and contact its owner before `--force-lock --apply`; active local processes cannot be forced out.
