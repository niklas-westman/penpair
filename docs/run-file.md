# Running reviewed plugin bodies from files

`run-file` sends explicitly selected JavaScript bodies to the Penpot plugin. It does not import those files or unrelated project extensions into the Node process. Files must be `.js` or `.mjs` bodies for an async function, not host modules. Paths resolve inside the configured project, including real symlink targets. Config-free standalone execution is unavailable.

```sh
penpair run-file design/read.js --page Candidate --param id=SHAPE_ID \
  --include design/helpers.js --include design/project-helpers.js
```

Each file that runs read-only at top level starts with `// penpair: read`. This includes helper preludes and inspection/readback phases. Helpers are concatenated in caller order before the phase body, after the page guard. Parameters are literal strings available as `CFG`; duplicate or malformed keys refuse. `CFG.page` is owned by `--page`, and `CFG.inspection` is reserved for writes.

A read declaration is a trusted contract, never a JavaScript sandbox. Review includes too. A helper may define functions used by a later write phase, while its top-level inclusion must itself remain read-only. Read executions disable automatic suspension retries and require an explicit `ok: true` result.

## Reviewed writes

To preserve the write protocol, a write file needs both leading declarations:

```js
// penpair: write
// penpair: idempotent
```

It also requires explicit read-only `--inspect` and `--readback` files. The command runs only inspection by default:

```sh
penpair run-file design/rename.js --inspect design/rename-inspect.js \
  --readback design/rename-readback.js --page Candidate \
  --param id=SHAPE_ID --param name=ReviewedName
```

Review that inspection, then add `--apply`. Undeclared or unverified raw writes refuse even when `--apply` is supplied. This is stricter than a raw executor: acknowledging arbitrary code is insufficient to claim an independently verified design change. For a custom code-defined verifier use a registered snippet operation.

A small example follows. Inspection captures the original target:

```js
// penpair: read
const shape = penpot.currentPage.getShapeById(CFG.id);
if (!shape) throw new Error("Target missing");
return { ok: true, id: shape.id, beforeName: shape.name, desiredName: CFG.name };
```

The write uses that independent observation, tolerates its already-completed state and refuses a third state:

```js
// penpair: write
// penpair: idempotent
const shape = penpot.currentPage.getShapeById(CFG.id);
if (!shape || shape.id !== CFG.inspection.id) throw new Error("Target changed");
if (shape.name !== CFG.inspection.beforeName && shape.name !== CFG.name) throw new Error("Source changed");
shape.name = CFG.name;
return { ok: true };
```

Readback reads the real target from scratch:

```js
// penpair: read
const shape = penpot.currentPage.getShapeById(CFG.id);
return { ok: true, verification: {
  expected: { id: CFG.id, name: CFG.name },
  actual: shape ? { id: shape.id, name: shape.name } : { missing: true }
} };
```

The common verifier requires matching nonempty expected/actual objects. Empty `problems: []` cannot pass. The code's author still owns the meaningful postconditions, read-only declarations and idempotency. Export affected frames and look at them twice as the write protocol requires; structural verification does not approve pixels.

## Identity, budgets and recovery

Final wrapped UTF-8 snippets obey the existing 90 KB guard, including helpers, guards, parameters and the captured inspection passed to apply. Every phase compiles offline before connecting; an oversized runtime inspection can still make apply refuse before delivery. Each input file is bounded independently, and at most 20 distinct include paths and 100 parameters are accepted. Reports identify the ordered source text hashes actually prepared. No implicit imports, glob expansion or transpilation occurs.

Writes reuse pinned file guards, revisions, writer coordination, positive independent verification and redacted journals. Optional `--checkpoint`, `--force-lock` and explicit `--apply --resume RUN_ID` follow normal recovery rules. Source/parameter changes refuse resume; a final state already independently verified is not written again. Partial unexplained state requires inspection; there is no rollback or enforced idempotency sandbox. A redacted journal cannot be presented as complete verification or automatically resumed.

`run-file` checks layout where the write happened, not on the whole page. The inspect script reports the existing boards the write touches as `layoutRoots` (an array of shape IDs, e.g. `return { ok: true, layoutRoots: [board.id] }`); those are observed before planning, after the write and during recovery. When the inspection names none, the layout check is reported as `method: "skipped"` with the reason, and the independent readback still decides the result. `--layout-scope page` restores the whole-page sample as an opt-in audit.

To scope layout settling by hand, use repeatable `--layout-root SHAPE_ID` (it overrides `layoutRoots`). `--layout-max-nodes N` sets the shared sample budget (1–100,000; default 10,000). The roots must exist before the write and remain present through readback. Reports and `penpair runs RUN_ID` retain the roots and sampled node count. Budget overflow continues with explicitly partial layout evidence; independent readback is still required. See [layout settling](layout-settling.md) for scope and partial-sample limits.

## A write that was not needed

If the readback already holds before the write, a journaled `run-file --apply` does not run the write. The report says `outcome: "already-satisfied"` with `skipped: "readback-already-satisfied"` (the journal step in `penpair runs RUN_ID` carries the same `skipped` field), a warning names it, and `verified` stays true because the state is right. It is not a successful write: check that the readback tests the change itself, not only that the target exists. The outer command result keeps its fixed `outcome` set; read `data.outcome`.

The readback script receives `CFG.inspection`, the inspection taken before this process wrote anything, next to its parameters. A resumed run that began after a partial write gets the inspection of its own first observation.
