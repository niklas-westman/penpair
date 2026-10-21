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

A response lost after a mutation leaves the step uncertain, even if the file changed successfully. Completed batches remain applied. There is no automatic rollback over human edits. This release's recovery tests use simulated Penpot execution and HTTP transport faults; live recovery on a scratch file remains to be checked. Writer coordination is tracked separately in A3.
