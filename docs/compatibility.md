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

## Capability-driven native APIs

`probe` now emits report `schemaVersion: 1`, the observed Penpot API version, target IDs, observation time, and presence of layout wait, integrity validation, version-history and markup/style/font helpers. Presence is not a behavior test. `probe --integrity` invokes `File.validate()` only when supported; unsupported is explicit, issues return `valid: false` and a failing CLI status, and thrown/malformed API results do not count as valid. The ordinary probe and doctor do not create versions or run write-capability tests.

Library helpers accept the project's guarded client:

- `waitForStableLayout(client, { shapeId, timeoutMs })`: prefers supported native completion; otherwise polls geometry. Native failure, target changes, incomplete samples and timeout cannot pass. Geometry stability does not establish token/font/pixel correctness; independent readback and stable exports remain necessary. Integration into default write/export settling is tracked by B4.
- `validateFileIntegrity(client)`: distinguishes unsupported from a valid empty issue list or actual referential-integrity problems.
- `createCheckpoint(client, { label, runId }, { apply })`: optional native version history. Without apply it inspects; with apply it saves a run-keyed named version once and independently finds it again. Reusing that run ID reuses an existing checkpoint; it does not provide atomic cross-client locking. No automatic restore/rollback is performed.

Current upstream references: [Penpot API](https://doc.plugins.penpot.app/interfaces/Penpot), [File API](https://doc.plugins.penpot.app/interfaces/File), [FileVersion API](https://doc.plugins.penpot.app/interfaces/FileVersion). Unit fixtures cover missing, present and throwing APIs. These helpers have not yet been exercised against the pinned 2.18.3/2.18.4 instances; the live compatibility table above is intentionally unchanged.

## Hosted archive candidate

`backup file` requests the documented `currentFile.export("penpot", "all")` signature, bounds the returned payload and refuses to accept an archive if file identity/revision changed. Simulated tests do not resolve the observed live export failure or establish import fidelity. Follow the [scratch round-trip checklist](backup.md#prove-the-restore-on-scratch) before marking this path proven; the live table remains unchanged.

## Build-brief observations reviewed 2026-10-21

Scope: hosted Penpot 2.18.4, as reported in the design-build brief. These reports were incorporated into the shipped [plugin gotchas reference](../packages/core/skills/penpair-design/references/penpot-plugin-gotchas.md#build-report-hosted-penpot-2184-reviewed-2026-10-21); they were not independently rerun on this branch and do not add passes to the live matrix.

| Reported area | Workaround or verification requirement |
| --- | --- |
| Stretch row nested in a hugging parent | Try start alignment plus intentional explicit child height; inspect actual geometry. |
| Fill child changes parent hug sizing | Reassert auto only when hug is the intended parent contract; read back sizing. |
| Fixed sizing leaves the 100 px default | Resize to explicit intended dimensions. |
| Empty characters rejected | Omit the node or deliberately use a non-breaking space. |
| `fillOpacity` cannot be assigned | Use whole-shape opacity or the fill array; verify after token binding. |
| Token formulas and adding a set to an existing theme | Inspect resolved values under the intended active theme; portability is a separate question. |
| Instance children cannot be freely removed/reordered | Match structural variants; verify supported overrides. |
| Layout padding setters differ from token binding keys | Keep setter and binding names distinct. |
| Component creation splits path/name and can race saved bindings | Use the local library API and observe bindings before creation. |
| A font token alone did not guarantee the exported face | Find/apply the actual font variant and review the export. |
| Square resizing distorts a non-square path | Preserve aspect ratio inside a fixed-size wrapper. |
| Layout/export takes roughly 10–30 seconds to settle | Bounded layout evidence plus independent stable exports; no fixed-delay proof. |
| Hidden editor loses heartbeat, observed after 6–8 minutes | Keep a separate visible editor window; retry only declared reads and inspect uncertain writes. |

The existing doctor remedy already says to keep the tab visible. Its text now also suggests a separate window; it does not predict the browser's suspension deadline. Recipe enforcement will be delivered with the kit, and default layout integration with the settle item. The documentation does not imply those later items are implemented.
