# Guarded token editing

All commands inspect by default; add `--apply` to execute one guarded write and independent readback. A project config is required. Existing file pins, write journals, writer coordination, revision checks, optional checkpoints, deadlines and uncertain-write recovery apply.

```sh
penpair tokens add-set 'Project · Page'
penpair tokens set 'Project · Page' card-radius --type borderRadius --value '"{radius} * 2"' --description 'Project card'
penpair tokens remove 'Project · Page' card-radius
penpair tokens promote 'Project · Page' 'Shared · Page'
```

`--value` is JSON: quote a string inside shell quotes, or provide a composite string-valued object. The documented [Penpot token types](https://doc.plugins.penpot.app/types/TokenType) are validated before connecting. An omitted description becomes an empty string. Tokens are at most 16 KiB.

`add-set` creates an inactive set, or observes an existing one without changes. `set` creates or updates one same-type token. Type replacement requires separate reviewed removal. `remove` removes one token; it never deletes a set. It refuses retained formula references and shape bindings, even if another set might supply the same name. `promote` copies every source token into an existing destination, preserving source, theme membership and active selection. Identical destination tokens are accepted; conflicts refuse the entire plan before writing. Repeating a successful command is idempotent.

The operation snapshots the catalog and shape bindings, builds its desired state, and rechecks source content immediately inside the mutation. Independent readback checks the complete observed token state, bindings and active selection. Known font-family/typography storage aliases are normalized for verification. It does not claim resolved per-theme or pixel equivalence. Token edits can affect shapes using those names; inspection includes their IDs.

Inspection refuses partial inventories: at most 10000 tokens, 20000 shapes and a conservatively bounded document. The final wrapped request still must fit the 90 KB snippet guard; a large pinned precondition can therefore refuse an edit before delivery. Use a narrower reviewed project operation for larger documents. No local token cache is trusted.

On an uncertain response inspect the file and `penpair runs`, then explicitly resume with `--apply --resume <run-id>`. Already-satisfied final state is independently reconciled. A partial promotion whose state differs from both original and final refuses automatic continuation; inspect it and prepare a new reviewed plan. There is no transaction or rollback.

These are live editing commands, not declarations of adapter ownership. Declare reproducible project tokens in the adapter configuration. Current API references describe [sets](https://doc.plugins.penpot.app/interfaces/TokenSet) and [catalog ordering](https://doc.plugins.penpot.app/interfaces/TokenCatalog); offline simulations do not establish pinned-version live compatibility.
