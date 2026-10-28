# Recovering interrupted writes

CLI archive, registered write operations and adapter token pushes record their plans in `.penpair/runs/<run-id>.json` before applying a step. The directory is ignored by Git before evidence is written; records use mode 0600. Evidence can contain design content, so keep the directory private. Endpoint credentials are redacted, including known bare keys. A journal whose evidence needed redaction cannot automatically resume.

Inspect a failure locally:

```sh
penpair runs
penpair runs <run-id>
```

These commands work offline, even when project configuration is broken. Resume the original command with its original inputs and explicit apply:

```sh
penpair archive --page Drafts --name Archive --keep Live --parts Parts --apply --resume <run-id>
penpair run <write-name> --param name=value --apply --resume <run-id>
```

Adapter token push also accepts `--apply --resume <run-id>`. It uses the saved original actions and the current committed snapshot. Keep the same engine, operation implementation, snapshot, parameters, prune and checkpoint choices. Changed inputs or source signatures are refused. The direct library runner opts in through `OperationOptions.journal`; unjournaled library calls do not gain recovery automatically.

Resume checks file identity and independently reads actual state. Verified steps are checked again. Token batches rebuild residual work, including partial additions and replacements, rather than blindly replaying previous writes. Third values, changed protected shape structure, or ambiguous identity stop recovery. An archive with a partially created parent whose ownership cannot be established stops for inspection. Custom operations may supply an explicit reconciliation function; otherwise only unchanged inputs or independently verified final state permit recovery.

Add `--checkpoint` to request a run-keyed named Penpot version before operation steps. That flag requires a supported API and independently verified checkpoint; an unavailable checkpoint stops the run. Keep the flag when resuming. A checkpoint is a recovery aid, and is neither a transaction nor proof that a separate backup can be restored. See [backup guidance](backup.md).

A response lost after a mutation leaves the step uncertain, even if the file changed successfully. Completed batches remain applied. There is no automatic rollback over human edits. This release's recovery tests use simulated Penpot execution and HTTP transport faults; live recovery on a scratch file remains to be checked. Journaled CLI writers also use local locks and shared advisory markers; see [team coordination](team.md).

## Coordination evidence

Use `--trace --apply` on journaled core writes or `marwes tokens push` to retain bounded lease/revision events in the private run journal. Inspect with `penpair runs RUN_ID`. Events contain identity, stage and time; they omit document text, token values and endpoint credentials. A revision change remains a conflict even if delayed marker persistence is suspected. Tracing does not establish causality or permit automatic retries.

## Fresh doctor evidence

`penpair doctor --json --timeout-ms 5000` uses a total origin/connection/execution budget (1000–30000 ms). It reports origin reachability, connected transport, a fresh random editor challenge with file/page IDs, and file-pin matching separately. Observation times/durations are measured; heartbeat and unobserved API versions stay unknown. A reachable origin or a connected transport alone is insufficient. Reconnect/foreground an unresponsive editor and obtain a fresh read before starting another operation.

## Shapes without an id on the page root

An interrupted build can leave shapes with no id and no name directly on the page root. They make every whole-page layout observation fail with `Malformed layout geometry`, which now names the shape (`a shape with no id ... at index 3 under the layout root`). Until they are gone, scope layout checks with `--layout-root`, or rely on `run-file`'s default (it checks only the `layoutRoots` its inspect script reports).

```sh
penpair repair --page PAGE --empty-shapes           # read-only: counts and lists them
penpair repair --page PAGE --empty-shapes --apply   # asks Penpot to remove them, then recounts
```

The write is journaled like the other operations (`--resume`, `--checkpoint`, `--force-lock`), refuses if the number of shapes changed since the inspection, and skips the whole-page layout observation these shapes break. Its verification is an independent recount: if Penpot's `remove()` does not clear them (on some Penpot versions it does not), the run reports `failed` with the counts instead of claiming a repair. The fallback is to reload the editor tab, and if they remain, to recreate the page and copy the boards over.

Stale local writer locks have their own command: `penpair locks` lists them with the holding run, operation and command, and `penpair locks clear` removes only those whose process is gone on this host.
