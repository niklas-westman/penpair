# Compatibility

What has been checked, where, and what differs. Update it whenever a Penpot is probed. "Not run" means not run, not that it fails.

| | Local Docker, Penpot 2.18.3 | Hosted, design.penpot.app, Penpot 2.18.4 (free account) |
| --- | --- | --- |
| Tools offered | `execute_code`, `high_level_overview`, `penpot_api_info`, `export_shape` | the same four |
| Request body | 90 KB accepted, 110 KB refused | the same |
| Response size | 3 MB returned | 1 MB returned (larger not tried) |
| Plugin API: tokens, `uploadMediaData`, `createBoard`, `openPage`, file export | present | present |
| `currentFile.export` | fails ("No matching clause") | not tried |
| Deep check (`probe --deep --write`): flex layout, text, token set and binding, components and swap, clone, PNG export, clean-up | all steps pass, nothing left behind (run on a fresh instance's empty file) | all steps pass, nothing left behind (run twice) |
| `pages`, `tree`, `audit`, `tokens dump`, `export` (waits for a stable render), `archive` with `--apply`, a project snippet that writes (`run seed-demo`) | all in use | all verified on seeded sample content |
| `doctor` (external profile) | ok | ok |
| `init`, `up`, `doctor` for a Penpot penpair starts (a fresh instance on its own port, then the owner's account, key and plugin connection) | ok: 16 seconds to answer with the images cached; `doctor` all ok | not applicable |

## Differences found
- **A new token set starts inactive, with no themes in the file.** Seen on both the hosted Penpot and a fresh local instance. (An earlier note that local sets start active was wrong or applied to a file with themes.)
- **A token binding is recorded after the call, not during it.** On the hosted Penpot it appeared after about half a second to a few seconds; reading it straight away shows nothing. Code that checks a binding has to wait for it.
- **Applying the same token again removes the binding** (seen on the hosted Penpot, as in the local notes).
- **A library component's name is split into a path and a name.** Naming the shapes "Demo / button" and creating the component gives a component whose path is "Demo" and whose name is "button"; setting the component's name to the full text afterwards makes the main shape "Demo / Demo / button". Create the component and leave its name.
- **Exporting a small board took about 3 to 4 seconds on the hosted Penpot and about 7 seconds on the local one.** The first export after a change can be stale; `export` takes two until they match.
- **Versions differ by one patch release** (2.18.3 local, 2.18.4 hosted). Nothing in the checks depended on it. Pin the version that was tested, and run the deep check before moving it.

## Not checked
- The hosted Penpot on a large file, with real design content and a shared library.
- Paid plans, and whether the free plan keeps the remote MCP.
- Two people in the same hosted file while an agent writes.
- Penpot's own version history as a backup for an external project.

## Automated checks and manual scratch smoke

The local suite includes a real HTTP fake MCP server: protocol negotiation, tool discovery, authentication rejection/redaction, read-only suspension retry, write acknowledgment loss and malformed replies. Generated normalization invariants exercise color case, font-list storage and typography normalization. These are transport/storage tests, not evidence of new live Penpot compatibility.

After `pnpm build`, an owner can run `pnpm smoke:live --scratch-file <disposable-file-id> --origin <expected-origin> --expected-version <x.y.z> --confirm-scratch`. Set `PENPAIR_MCP_URL` in the environment (never as a command argument or committed value). The harness refuses missing confirmation, wrong instance/file and version drift before the mutating probe. It uses the existing tagged deep check and independently verifies cleanup. Every required step must be observed; empty reports cannot pass. An uncertain write is never replayed automatically; use the tag/run ID to inspect leftovers.

The `Scratch Penpot compatibility smoke` workflow is manual-dispatch only. Configure a protected `penpot-smoke` environment and its `PENPAIR_SMOKE_MCP_URL` secret, then open the disposable file and keep its authenticated editor/plugin connected. CI cannot create that browser session from a key alone. The workflow stores a redacted text report; update the live compatibility table only after reviewing an actual run. A scheduled nightly hosted job remains deferred until editor-session lifecycle is solved. The first live run of this harness is still outstanding; no hosted/local version gained a new verified check from the unit tests.
