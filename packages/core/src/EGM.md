# src — the penpair engine

## Overview

The whole library lives here: the command dispatcher, the transport to a live
Penpot editor, the protocol that makes a write to someone else's design file
safe, and the artifact layers built on top of it — inspections, structural
snapshots, image baselines, design tokens, maps and releases.

Two architectural facts shape every file in this directory.

**The core has no command of its own.** `cli-main.ts` exports `runCli` and
`runCommand`; the sibling command packages call them and decide how to exit.
The dependency runs one way only — the core never imports from a sibling
package, and a local-Penpot implementation arrives injected as a `LocalProfile`.

**The core names no project that adopts it.** Adapters register through
`defineAdapter` and are loaded by specifier from the project's configuration.
A test (`test/neutrality.test.ts`) walks every file under this directory,
lowercases it, and fails the build if it finds the name of an adopting project
or component library — including in this document. Describe adapters abstractly
or not at all.

## Interface

`index.ts` is the package's public surface; it re-exports most of the modules
below plus the three model directories.

### Entry points and the plug-in contract

| Module | Role |
| --- | --- |
| `cli-main.ts` | `runCli(argv, options)` — the entry point for command packages, which sets up an `AsyncLocalStorage` project context, installs SIGINT/SIGTERM handlers, and returns an exit code. `runCommand(argv, options)` — the structured service boundary; always forces `--json`, wraps work in `collectCommand`, and refuses the interactive `setup` and `connect`. Dispatch is on `argv[0]`: reserved names go to the built-in chain, anything else triggers adapter loading. |
| `adapters.ts` | `defineAdapter`, `loadAdapters`, `reservedCommands` (42 built-in names), and the `Adapter`, `AdapterCommand`, `AdapterContext` types. |
| `local-profile.ts` | `LocalProfile` — the nine-method interface (`preflight`, `init`, `up`, `down`, `status`, `doctor`, `backup`, `verifyBackup`, `restore`) a command package implements to run a local Penpot; `LocalContext`; `requireLocalProfile`. |
| `cli-arguments.ts` | `parseCommandArgs`, `CommandArgumentError`. |
| `command-result.ts` | `CommandResult`, `commandResultSchema`, `collectCommand`, `commandOutput`, `commandSleep`, `withCleanupDeadline`, and the signal and redactor helpers. |
| `errors.ts` | `PenpairError` with a typed `PenpairErrorCode` and a `remedy` for each of the twelve codes. |
| `version.ts` | `version` — a single export so neither entry point need import the other. |
| `mcp-server.ts` | The MCP server that exposes commands as tools over stdio. |

### Transport and the write protocol

| Module | Role |
| --- | --- |
| `operation.ts` | `Operation<P>` — the five-slot contract for a safe change: `inspect`, `apply`, `readback`, `verify`, optional `reconcile`. "Look first, change once, read back independently." `OperationReport`, `OperationOptions`, `runOperation`, `runOnPage` (`runOperationInSession` is module-private, not exported). |
| `client.ts` | `PenpotToolClient`, `connect(endpoint)`, `executeCode`, `executionEnvelope`, `classifyFailure`, `maxSnippetBytes`. |
| `endpoint.ts` | `Endpoint`, `EndpointDescription`, `resolveEndpoint`, `redactEndpoint`. |
| `coordination.ts` | `writeCoordinator`, `WriteLease`, `guardRevision`, `listLocks`, `clearDeadLocks`. |
| `page-session.ts` | `withPageSession` serialises operations per client; `pinPageSnippet` injects a file-and-page identity check. |
| `snippet.ts` | `snippet(name, body, params, effect)` and `runSnippet`. |
| `registry.ts` | `SnippetRegistry`, `defineSnippet`, `normalize`. |
| `queue.ts` | `QueueSpec`, `QueueJob`, `QueueRecord`, `parseQueueSpec`, `jobArguments`. |
| `journal.ts` | `runJournaledSteps`, `readJournal`, `listJournals`, `observationHash`. |
| `approvals.ts` | `ApprovalRecord`, `ApprovalFile`, `approvalFingerprint`, `validateApprovals`, `recordApproval`. |
| `probe.ts`, `plugin-health.ts`, `deep-check.ts`, `native-api.ts` | Read-only capability probing, tri-state plugin health, deep file checks, `validateFileIntegrity` and `createCheckpoint`. |
| `credentials.ts` | `readCredential` — owner-private file or OS keychain. |
| `file-guard.ts`, `file-archive.ts` | `guardFile` wraps a client with an inline file-id assertion; `exportFileArchive` pulls a binary archive. |
| `native-editor-clipboard.ts`, `clipboard-payload.ts`, `browser-wake.ts` | The native clipboard path over the browser debug protocol, payload matching, and tab focusing. |
| `atomic-output.ts`, `bounded-file.ts`, `project-input.ts` | `atomicWriteFile`, `readProjectBytes`, `resolveProjectInput`, `resolveProjectOutput`, `designDataBlock`. |

### Kits and skills

`kit.ts` (`kit`, `coreKit`, `instanceKit`, `checkKits`, `loadKits`,
`BuildKit`, `RecipeInfo`), `kit-source.ts` and `kit-instances.ts` (the sandbox
JavaScript itself), `kit-smoke.ts` and `live-smoke.ts` (`kitSmokeOperation`,
`runLiveSmoke`), `run-file.ts` (`prepareFileScript`, `runFileScript`),
`project-snippets.ts` (`loadProjectSnippets`), and the skill modules:
`skills.ts` (`installSkills`; `checkSkills` is in `skill-check.ts`), `skill-check*.ts`,
`skill-file.ts`, `skill-hosts.ts`, `skill-instructions.ts`,
`skill-metadata.ts`, `skill-routing.ts`, `onboard.ts`.

### Design artifacts

`inspection.ts` (`captureInspection`, `inspectChunk`, `reassembleInspection`
and the `InspectionQuery` / `InspectionDocument` / `CaptureBudget` types),
`structure-snapshot.ts` (`captureStructuralSnapshot`, `diffStructuralSnapshots`,
`StructuralManifest`), `baselines.ts` with `baselines-config.ts` and
`baseline-coverage.ts` (`exportBaselines`, `baselineCoverage`,
`readBaselineCoverage`, `designCaseKey`), `baseline-reference.ts`
(`matchingBaselineReference`, `validateBaselineReference`,
`validateBaselineSources` — cross-revision reference matching and
schema-3 multi-page page-inventory validation), `audit-rules.ts`
(`auditDesignRules`), `design-spec.ts` (`buildDesignSpec`, `checkDesignSpec`,
`writeDesignSpec`), `design-viewport.ts`, `export.ts` and `export-batch.ts`
(`exportShapePng`, `exportFrames`), `shots.ts` (`captureShots`,
`findShapesByName`, `exportShapeByName`), `image-evidence.ts`,
`image-codec.ts`, `png.ts`, `formats.ts` (`artifactSchemas`,
`migrateProjectConfig`), `layout.ts`, `layout-policy.ts`,
`layout-settling.ts` (`settleLayout`; `waitForStableLayout` is in `layout.ts`),
`capture-progress.ts` (public types `CaptureProgress`, `CapturePhase`;
internal: `capturePhase`, `progressReporter`, `ProgressOptions`),
`project-status.ts`, `backup-note.ts`.

Internal modules (not re-exported from `index.ts`): `capture-policy.ts`
(`nativeExportProfile`, `CapturePolicyName`, `isCapturePolicy`,
`applyCapturePolicy`, `crossRevisionContinuityProblem`),
`command-options.ts` (`commandOptions` — the shared `parseArgs` option
table for all built-in commands; `allowedCommandFlags` — per-command
flag allowlists), `penpot-workspace-url.ts` (`PenpotWorkspaceIdentity`,
`parsePenpotWorkspaceUrl` — parses a Penpot workspace URL from its three
accepted route forms into a routing identity; strips all other parameters).

### Design tokens

`token-projection.ts` (`ProjectionCatalog`, `numericExpression`),
`token-edit.ts` (`tokenTypes`, `validateEditableToken`, `planTokenEdit`,
`tokenEditOperation`), `tokens-diff.ts` (`parseTokenDump`),
`portable-tokens.ts` (`importDtcg`, `exportDtcg`).

### Child directories

| Directory | Contract | Role |
| --- | --- | --- |
| `design-commands` | [`./design-commands/EGM.md`](./design-commands/EGM.md) | The command layer for maps and releases, and the flag gating in front of every live write. |
| `design-releases` | [`./design-releases/EGM.md`](./design-releases/EGM.md) | The release pipeline: plan, copy, verify pixel-for-pixel, finalize an immutable bundle. |
| `generated` | [`./generated/EGM.md`](./generated/EGM.md) | Tracked build output from a developer-step script. Holds `layout-settling-source.ts`. Never edit by hand. |
| `help` | [`./help/EGM.md`](./help/EGM.md) | The offline command catalogue behind `penpair help`. Core topics are derived from the argument declarations; adapter topics come from static JSON manifests, so help never executes adapter code. |
| `instance` | [`./instance/EGM.md`](./instance/EGM.md) | Which Penpot a project talks to: config schema, credential, connection, setup wizard, health checks. |
| `map-penpot` | [`./map-penpot/EGM.md`](./map-penpot/EGM.md) | Renders the map model into real Penpot shapes and reads it back. |
| `maps` | [`./maps/EGM.md`](./maps/EGM.md) | The map model itself: schema, store, deterministic layout, proposal and review lifecycle. |
| `snippets` | [`./snippets/EGM.md`](./snippets/EGM.md) | Snippet factories for the archive and ghost-repair operations. |

## Invariants

### The write protocol

- **Look first, change once, read back independently.** `runOperation` calls
  `inspect` with `effect: "read"`, `apply` with `effect: "write"`, then
  `readback` with `effect: "read"`. An `apply` that does not return `ok: true`
  throws `UncertainExecutionError`; a readback with problems yields
  `verified: false` and outcome `"failed"`.
- **Only a read may be retried.** `ExecuteOptions.effect` is the switch: a
  `"write"` or `"unknown"` execution is never retried, and `runOperation` passes
  `effect: "write"` exactly once.
- **A write is guarded three ways.** `guardRevision` injects a file-id and
  revision equality check ahead of every write snippet — a soft guard inside the
  delivered script, not a server-side compare-and-swap. `writeCoordinator`
  acquires both a local lock at `.penpair/locks/<sha256-of-fileId>.json`
  (`wx`, mode `0o600`) and a shared in-file marker, with a 15-minute expiry that
  `WriteLease.check()` re-verifies mid-run. `withPageSession` serialises
  operations and `pinPageSnippet` aborts on external navigation.
- **A journalled step persists before it writes, and resume never replays.**
  Each started phase is written out before its write; a resume verifies the
  engine version, operation name, input hash, plan hash, target file id and step
  count, then inspects and reconciles actual state. Step keys are unique within
  a run.
- **The first export after a write or a page switch can be stale.**
  `ExportOptions.stable` defaults to `true` and loops until two consecutive
  exports are byte-identical under a matching capture identity (2 s apart, up to
  `maxExports` exports; `attempts` is a separate option, see `export.ts`). Independently, `settleLayout` requires three
  geometry-identical samples before calling layout stable, and
  `waitForStableLayout` must succeed before an export proceeds. Look twice.
- **The sandbox JavaScript for `settleLayout` is generated, not serialised at
  runtime.** `scripts/generate-layout-source.mjs` minifies `layout-settling.ts`
  and writes `src/generated/layout-settling-source.ts`, which `layout-policy.ts`
  imports. The generated artifact must be regenerated (run `pnpm sandbox:generate`)
  whenever `layout-settling.ts` changes. The build step (`pnpm build`) runs
  `generate-layout-source.mjs --check` and fails on any drift.
  `test/layout-source.test.ts` independently catches staleness at test time.
- **An agent cannot invent an approval.** `recordApproval` requires a stable
  independently-exported PNG, and non-empty owner words and identity; it throws
  otherwise. `validateApprovals` re-derives every record's hash and fingerprint
  on load and throws on any mismatch.
- **`capturePolicy` is part of approval identity.** `approvalFingerprint` hashes
  the whole `CaptureIdentity` object, including the optional `capturePolicy`
  field. An approval recorded without a policy cannot match one recorded with
  one, and vice versa. `applyCapturePolicy` (in `capture-policy.ts`) stamps a
  freshly observed capture with the named profile only when all the required
  evidence fields are present. An absent policy returns the capture unchanged; an
  unknown policy, or missing evidence, throws.

### Secrets

- **The MCP URL carries a personal key and must never be printed.**
  Two distinct mechanisms, often conflated: `redactEndpoint` substitutes the
  literal `[redacted]` for the URL, its query string and any `userToken` value in
  a string, and is called in `transportFailure` before any error is thrown or
  logged, and again in `probe.ts`. Separately, `EndpointDescription` *stores* only
  origin and pathname — it is a narrower record, not the redactor.
- `describeCommand` strips `userToken=`, `token=`, `key=`, `secret=` and
  `password=` before an argv reaches a lock file. `readCredential` lets no URL,
  key, child stderr or command error object into diagnostics.
  `browser-wake.ts` drops query strings and fragments from tab URLs because they
  can carry tokens. `recordApproval` refuses to write a record that redaction
  would alter.
- **`PENPAIR_MCP_URL_COMMAND` is rejected,** at both lookup points in
  `resolveEndpoint`. Only a file reference or the OS keychain is accepted;
  arbitrary command execution is not a credential source.

### Ceilings — exact values

- **Snippet: `maxSnippetBytes = 90 * 1024`**, declared in `client.ts` because
  Penpot's proxy refuses bodies of about 110 KB. `snippet()` throws
  `PenpairError("snippet-too-large")` before any network call; `run-file.ts`
  checks a script at load time and `file-guard.ts` throws if its prefix would
  push a snippet over.
- **Kits: 32,768 bytes per kit source, 49,152 bytes combined.** Both are inline
  literals in `kit.ts` (commented "32 KiB source budget" and "48 KiB budget
  reserved before project code"), with no symbolic constant name. Every kit
  source must begin with the literal line `// penpair: read`.
- **Artifacts and images**: 16 MiB per JSON design artifact, 64 MiB and 64
  megapixels per image (`maximumImageBytes`), 128 KiB per skill file
  (`maxSkillBytes`), 512 KiB default and 16 MiB ceiling for a file archive.
- **Queue**: at most 500 jobs, retries 0–5, backoff 0–60,000 ms, no duplicate
  job ids. **Settling**: `settleMs` 0–30,000.

### Boundaries and conventions

- **Exit codes are a closed set**: `{0, 1, 2, 3, 4, 124, 130}` — success,
  failure, drift, incomplete, uncertain, deadline, cancelled. Anything else from
  an adapter is normalised to `1` with a warning.
- **The core knows no adapter by name.** In command dispatch `loadAdapters` runs
  only when `argv[0]` is present, does not start with `--` and is absent from
  `reservedCommands`; `status --adapters` also calls it. Help lists configured names without
  importing a module. An adapter must `export default defineAdapter({...})`, may
  not claim a reserved or already-claimed command name, and is skipped with a
  recorded problem rather than throwing.
- **`version.ts` holds one string** and a test enforces it matches
  `package.json`. All six repository packages move together; never edit it by
  hand.
- **The sandbox JavaScript in `kit-source.ts` and `kit-instances.ts` sits inside
  `String.raw` template literals**, which is what exempts it from Biome
  formatting. Keep it there, and keep the surrounding TypeScript formatted.
- **Writes are atomic by construction.** `atomicWriteFile` writes
  `.{basename}-{uuid}.tmp` exclusively at mode `0o600`, syncs, then publishes by
  `link` (which fails if the destination exists) or by `rename` under
  `replace: true`, unlinking the temp file in a `finally` block.
- **Paths may not escape the project root.** `resolveProjectInput` and
  `resolveProjectOutput` are symlink-aware and reject any escape;
  `readProjectBytes` opens `O_RDONLY|O_NOFOLLOW|O_NONBLOCK` and rejects
  oversized reads twice, by stat and by streamed byte count. `run-file.ts`
  accepts only `.js` and `.mjs`.
- **`guardFile` refuses everything but `execute_code`** with a string `code`
  argument, and throws `PenpairError("file-mismatch")` on a failed inline file-id
  check. It returns the client unguarded (with a warning) when no file is pinned
  or `anyFile` is set, and in mode `"warn"` a mismatch is logged rather than thrown.
- **Determinism where a hash depends on it.** `structuralJson` sorts keys,
  `designSource` sorts nodes by id, `importDtcg` sorts tokens by path, and
  `checkDesignSpec` compares by exact string equality, so any provenance change
  or manual edit invalidates the spec. Token arithmetic goes through
  `numericExpression`, never `eval`, bounded to depth 64.
- **Findings are advisory; evidence is not.** `auditDesignRules` never throws
  and never blocks a write. By contrast a failed hash, fingerprint or file pin is
  always a hard error.
- **Image formats are narrow**: PNG or static lossless WebP only; animated PNG
  and lossy or animated WebP are rejected. After a WebP encode,
  `encodeBaselineImage` decodes both sides to raw RGBA and asserts byte
  equality, and verifies the ICC profile survived.
- **Project-owned skill files are never overwritten,** not even under `--force`;
  a skill's YAML `name` must match its folder name.

## Side Effects

- **Filesystem writes.** Most go through `atomicWriteFile`, but not all — these
  have their own mechanism and the distinction matters when reasoning about
  crash safety:
  - `.penpair/locks/<sha256-of-fileId>.json` — `open(…, "wx", 0o600)` then
    `handle.writeFile`, because exclusive creation *is* the lock.
  - `.penpair/runs/<runId>.json` — a temp write plus `link`/`rename` performed
    inside `journal.ts` itself.
  - Other exclusive-create `.lock` files: `design/approvals.json.lock`
    (`approvals.ts`), the snapshot pointer's `.lock` (`structure-snapshot.ts`),
    one `.lock` per target in `maps/store.ts`, and a `.write-lock` per destination in `design-releases/store.ts`.
  - `.penpair/queues/<id>.json` — temp file written with `wx`, then `rename`
    (`queue.ts`).
  - `reflection-cases.json` — written with `wx` inside a staged capture folder
    that is then renamed (`baselines.ts`).
  - The `.penpair/` git-ignore entry is a line appended to the project's
    `<root>/.gitignore` by `ensureGitignoreEntry`. There is no
    `.penpair/.gitignore` file; nothing writes one.
  - Through `atomicWriteFile`: `design/approvals.json` and
    `design/approvals/<sha256>.<format>`, structural snapshots, design specs,
    baseline images and `penpair-baselines.json`, and shot captures staged in
    `design/shots/.stage-<uuid>/` then renamed into
    `design/shots/captures/<uuid>/` with a `penpair-shots.json` manifest and the
    stage removed in a `finally`.
  `installSkills` writes skill folders and symlinks; the skill installer writes
  its owned routing block into `AGENTS.md` or `CLAUDE.md`. A temporary clipboard
  lock lives at `$TMPDIR/penpair-native-clipboard-<uid>.lock`.
- **Penpot**: a persistent streamable-HTTP MCP transport, one tool call at a
  time. Every snippet execution is one `execute_code` call. Writes mutate the
  live file, write `sharedPluginData` for the writer marker, and can call
  `saveVersion`. `probe` opens a fresh client per size test, because a refused
  oversized request can end the connection.
- **Browser debug protocol**, loopback only and validated: `/json/list` and
  `/json/activate/<targetId>` over HTTP to focus a tab, and a WebSocket to
  dispatch copy and paste key events. `wake --reload` additionally sends
  `Page.reload` over a WebSocket (`browser-wake.ts`). Clipboard text never leaves
  the page.
- **Environment**: reads `PENPAIR_MCP_URL`, `PENPAIR_MCP_URL_FILE`,
  `PENPAIR_MCP_URL_COMMAND` (only to reject it), the home directory and the
  working directory.
- **Processes and native code**: `nodeRunner` spawns without a shell;
  `encodeBaselineImage` dynamically imports `sharp` only for a WebP encode;
  `loadAdapters` and `loadProjectSnippets` use dynamic `import()` scoped to the
  project tree; the `mcp` command imports `./mcp-server.js` lazily.
- **Stdout**: neither entry point calls `process.exit` — an exit code is
  returned and the command package acts on it. In `--json` mode the complete
  `CommandResult` goes to stdout; human logs go to stdout and errors and
  warnings to stderr. While the MCP server runs, stdout carries protocol framing
  and nothing else may be written to it.
- **Clock and randomness**: `randomUUID()` for run ids, temp filenames and
  review ids; wall-clock timestamps in journal and capture records; `Date.now()`
  for settling deadlines.

## Verification

- Run: `pnpm test` from `packages/core`.
- `test/neutrality.test.ts` is the one to watch when editing documentation in
  this directory: it scans every file here for the name of an adopting project
  or component library and fails the build on a hit.
