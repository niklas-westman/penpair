# marwes-ui source

## Overview

The implementation of `@penpair/marwes-ui`, the penpair adapter that puts a
project's Marwes design tokens — and the project's own theme on top of them — into
a Penpot file, and then keeps finding anything that stops matching.

The direction of truth is fixed and the whole directory is built around it: the
installed Marwes library plus the project's theme module are the truth, Penpot is
made to match, and drift is surfaced rather than quietly reconciled. That gives
three layers. `marwes.ts`, `theme-input.ts` and `tokens.ts` compute what *should*
exist. `snapshot-file.ts` and `ownership.ts` persist that expectation and the
three-way ancestor needed to tell a designer's edit apart from an upstream one.
`penpot.ts` and `mode-trial.ts` talk to the live file, and `commands.ts` is the
single CLI surface over all of it.

Unlike `packages/core`, this directory is *allowed* to name a project and a
component library, and does: `@marwes-ui/core`, `mw-*` CSS variables and the
`"Marwes · Core"` set name are hardcoded throughout. That is the point of an
adapter — the neutral core stays ignorant and the project knowledge lives here.

The adapter plugs into `@penpair/core` through `defineAdapter` in `index.ts`. The
core loads it from the adopting project's `adapters` list in `penpair.config.json`
and names it nowhere; the dependency runs one way only.

## Interface

### Adapter entry (`index.ts`)

- `default` — the `defineAdapter({ name: "@penpair/marwes-ui", commands: [marwesCommand], kits: [marwesKit], status })`
  result. One command, one build kit, and a `status()` line that reports a
  `library-tokens` check as `ok` or `warning` from `checkSnapshotFor`.
- Re-exports the public surface of `commands`, `config`, `marwes`, `penpot`,
  `snapshot-file`, `theme-input`, `tokens`, `ownership`, `resolved-values`,
  `mode-trial`, `build-kit`, `components` and `theme-lint`.

### Command surface (`commands.ts`)

- `marwesCommand: AdapterCommand` — `name: "marwes"`, routing `theme lint`,
  `components schema|snapshot|check|diff|build` (`check` without `--measure` returns a
  `kind: "source-freshness"` report; `build` always throws) and `tokens schema|preview|migrate|snapshot|check|diff|push|status|verify-modes`.
- `Expectation`, `computeExpectation(root, rawConfig, instance)` — the expected
  `TokenSnapshot` from installed Marwes plus the project themes.
- `SnapshotCheck`, `checkSnapshotFor(root, rawConfig, instance)` — the offline
  staleness verdict, with typed `reasons` codes `missing-snapshot`,
  `schema-migration`, `missing-ownership`, `content-drift`, `metadata-mismatch`
  and `package-mismatch`.
- `checkTokenSnapshot(root)` — the entry point an adopting project calls from its
  own test suite to fail CI on a stale snapshot.

### Token model (`tokens.ts`)

- Types `PenpotTokenType`, `PenpotToken`, `PenpotTokenSet`, `PenpotTokenTheme`,
  `TokenSnapshot`, `MarwesCore`, `SnapshotInput`.
- Constants `coreSetName` (`"Marwes · Core"`), `darkSetName` (`"Marwes · Dark"`),
  `themeGroup` (`"Mode"`).
- `toHexColor`, `tokensFromVars`, `tokensAbove`, `canonical`, `isMapped`,
  `unmappedVariables`, `buildSnapshot`, `normalizeValue`.

### Snapshot persistence (`snapshot-file.ts`)

- `readSnapshot`, `writeSnapshot`, `diffSnapshots`, `formatDiff(diff, limit = 8)`,
  `migrateTokenSnapshot(raw, ownership)`, `tokenSnapshotSchema`, and types
  `TokenChange`, `SetChange`, `SnapshotDiff`.

### Configuration and theme input

- `MarwesSettings`, `defaultSnapshotPath`
  (`"design/marwes-tokens.snapshot.json"`), `MarwesConfigError`,
  `readMarwesSettings(rawConfig, instance)` (`config.ts`).
- `ThemeReference`, `loadThemeInput(root, reference)` returning
  `{ input, fileHash }` (`theme-input.ts`).
- `ThemeLintSettings`, `readThemeLint`, `lintThemeFamily(defaults, project, settings)`
  — an advisory hue-drift record, never a hard failure (`theme-lint.ts`).

### Installed library (`marwes.ts`)

- `MarwesError`, `InstalledMarwes`, `loadInstalledMarwes(projectDirectory)`,
  `familyProblems(installed)`.

### Ownership and reconciliation

- `OwnershipChange`, `OwnershipReport`, `ownershipReport(desired, live, ancestor?)`,
  `assertSafeDestruction(actions, live, bindingCounts)`,
  `readSyncAncestor(root, fileId)`,
  `saveSyncAncestor(root, fileId, snapshot, expectedAncestor?)` (`ownership.ts`).
- `reconciliation.ts` holds `actionSatisfied`, `reconcileAction` (returning
  `"complete" | "pending" | "conflict"`) and `remainingAction`; `index.ts` does
  not re-export them, and `penpot.ts` imports them for the journaled path.
- `numericExpression` (re-export), `ResolvedExpectation`, `expectedResolved`,
  `compareResolved` (`resolved-values.ts`).

### Penpot read and write (`penpot.ts`)

- Reads: `readTokens()`, `bindingCounts()`, `structureFingerprint()`,
  `readLive(client)`, `impactOf(client)`.
- Types `LiveTokens`, `TokenDrift`, `SetDrift`, `ThemeDrift`, `Drift`, `Action`,
  `PlanOptions`, `ApplyReport`.
- Pure logic: `compareToPenpot(expected, live, { ancestor })`,
  `formatDrift(drift, impact?, limit = 6)`, `planPush(expected, live, options)`,
  `describePlan(actions)`, `inBatches(tokens)`.
- `applyPlan(client, expected, actions, onStep?, options)` — the write engine.
- Private, named write snippets: `marwes-create-set`, `marwes-add-tokens`,
  `marwes-update-tokens`, `marwes-replace-tokens`, `marwes-remove-tokens`,
  `marwes-create-theme`, `marwes-sync-theme`, `marwes-activate-theme`.

### Component instances (`components.ts`)

- `componentProperties` (an 18-property tuple), `componentSnapshotSchema`
  (`urn:penpair:schema:v1:component-pilot`).
- Types `ComponentCase`, `ComponentPilot`, `ComponentMeasurement`,
  `ComponentSnapshot`, `ComponentRenderer`.
- `readComponentPilot`, `componentSourceHash`, `componentTokenCandidates`,
  `measureComponentPilot`, `validateComponentSnapshot`, `diffComponentSnapshots`,
  `componentsCommand`.

### Mode trials (`mode-trial.ts`)

- `ModeComparison`, `ModeTrialReport`, `ModeTrialOptions`,
  `runModeTrial(client, snapshot, options)`. The selection mechanics
  (`readMode`, `changeSelection`, `compareMode`, `desiredSelection`, `publishModes`)
  are module-private by design.

### Build kit (`build-kit.ts`)

- `marwesKit: BuildKit` with `include: "@marwes-kit"`, `requires: ["@kit"]` and
  five recipes. Its `source` is a `String.raw` template, so escape sequences in it
  are literal — editing it with ordinary template-literal instincts silently
  changes the emitted snippet.

This directory has no subdirectories.

## Invariants

### Adapter boundary

- The dependency runs one way: this package imports `@penpair/core`, and the core
  never imports this package. The core must keep naming neither adapter.
- An adapter may contribute CLI commands, an optional `status()` and build kits.
  It must not register MCP tools or registry snippets.
- **The command is named `marwes`, with `tokens` as a subcommand, and that is
  forced.** The core's `reservedCommands` list includes both `tokens` and
  `snapshot`, and `packages/core/src/adapters.ts` rejects an adapter claiming any
  reserved name at load time. Renaming `marwesCommand.name` to a reserved word
  makes `loadAdapters` record a problem and drop that command; the adapter
  itself is still loaded.
- Released at the same version as every other package in the repository. Never
  bump a version by hand.

### The write protocol is implemented here, not optional

The repository rule — read-only inspect, a pinned snapshot, one idempotent write,
an independent readback, an export that is looked at — exists as code. Do not
collapse any of its reads:

- `readPenpot` pins the file with `guardFile` on the journal target's `fileId`,
  reads, then re-reads the target and throws `File changed during token inspection`
  if the id or revision moved.
- `applyPlan` pins with `guardFile` when `options.expectedFileId` or
  `options.journal` is set, fingerprints structure and reads live state
  *before* writing, then independently re-reads live state and re-fingerprints.
  With `options.journal` it runs one step per batch of an action under
  `guardRevision(guarded, target)`. Without a journal it takes the plain path:
  it writes each batch behind a destruction guard, with no `guardRevision` and
  no per-step readback, and reads back once at the end. It sets `verified` only
  when the drift is in sync *and* the structure hash is unchanged across the
  write.
- **Look twice.** Every readback is preceded by `settle()` → `waitForStableLayout`,
  which throws rather than returning an unsettled read. `applyPlan`'s `settle()`
  and the mode trial's do nothing when called with `layout: false`. `mode-trial.ts` goes
  further: `stableMode()` demands two consecutive identical `resolved`
  observations across 2–20 samples within a 5 s deadline, and after
  `exportShapePng` it re-reads and throws `Mode changed during export` unless
  page, selection and resolved values are all identical. A first export after a
  write or a page switch can be stale; replacing any of this with a single read
  reintroduces that bug.

### Payload ceilings

The 90 KB snippet ceiling is **not** enforced in this directory. It lives in the
core as `maxSnippetBytes = 90 * 1024` (`packages/core/src/client.ts`), checked in
`client.ts` and `snippet.ts`. What this directory owns is the *margin*:
`inBatches` batches at `batchSize = 40` tokens and `maxBatchBytes = 45 * 1024`
bytes, and every token-bearing action goes through it on both the journaled and
the plain path. Raising either constant narrows the margin against the core limit.

### Idempotency and ordering

- Not every write snippet is idempotent or reports a skip.
  `marwes-update-tokens` and `marwes-replace-tokens` report per-token failures
  in `failed`; `marwes-remove-tokens` is not idempotent (a name already gone
  lands in `failed`, and the plain caller throws on a non-empty `failed`); and
  `marwes-sync-theme` only returns the resulting sets. The snippets that do
  report a skip: `marwes-create-set` returns `{ existed: true }`;
  `marwes-add-tokens` moves names already present into `skipped`, keeping
  `failed` for genuine errors, because the plain caller throws on any non-empty
  `failed`; `marwes-create-theme` returns `{ existed: true, added }` and attaches
  only the wanted sets it finds missing — it never removes one, since removing a
  set from a theme is a planned destruction; `marwes-activate-theme` returns
  `{ alreadyActive: true }` whenever any theme is active, not only when the
  wanted one is. `findSet` and the theme lookups still throw on a
  missing or ambiguous target rather than guessing.
- Replaying a satisfied plan is a supported path, not only a planned no-op. The
  plan layer already returns an empty plan after a successful push, but a resumed
  or stale plan re-issues actions whose targets now exist, and those must not
  surface as an uncertain outcome.
- The journaled path computes `remainingAction` and skips a step already
  satisfied, and embeds a source-equality guard comparing a fresh `readTokens()`
  against the exact JSON it observed.
- Ordering is load-bearing: `createSet` precedes `addTokens`, and `createTheme`
  precedes `activateTheme`. `changeSelection` deliberately deactivates all
  themes, then all sets, then activates the wanted theme, then fixes the sets,
  because a direct set change disables themes. A newly created set is forced
  inactive so it cannot join resolution before a theme says so. Reordering any of
  this breaks correctness.

### Destruction is gated

- `removeTokens` and `replaceTokens` carry an in-snippet `destructionGuard` that
  re-reads tokens and bindings and re-runs `assertSafeDestruction` *inside*
  Penpot. That inner guard checks binding counts and token references only.
- Pruning refuses any name absent from the verified ownership ancestor; that
  check is in `applyPlan` on the client, before any write snippet runs (the settle, fingerprint and live-read snippets run first).
- Only sets named by the expectation are ever judged or touched; unmanaged live
  sets and tokens are reported, never modified.
- `assertSafeDestruction` is deliberately conservative across all sets, including
  unowned ones.

### Ownership

- Every generated set is owned by `"adapter"`; every `marwes.extras` set is owned
  by `"project"`. A collision between the two throws.
- `ownershipReport.blockers` is every change whose kind is not `"upstream"`.
  penpair may apply only upstream changes; `designer`, `conflict` and `untracked`
  changes block a push and require a human.

### Persisted schemas — these literals are on-disk compatibility

- The snapshot writer emits `schemaVersion: 2` with an `ownership` block; readers
  accept `1` and `2` and migrate. `tokenSnapshotSchema`
  (`urn:penpair:schema:v2:adapter-token-snapshot`) must stay in sync with
  `buildSnapshot`'s output keys.
- The snapshot `hash` is `sha256(canonical({ marwesVersion, project, sets, themes, unmapped, ownership }))`
  — exactly those six fields, in that shape. Changing the field set or
  `canonical`'s key sorting invalidates every committed snapshot in every
  adopting project.
- "Current" versus "stale" *is* that hash plus `marwesVersion`: `diffSnapshots`
  flags `versionChange`, and `identical` requires no version change.
- The ancestor ledger record is its own schema —
  `{ schemaVersion: 1, fileId, savedAt, sha256, snapshot }` at
  `.penpair/token-sync/<sha256(fileId)>.json` — verified by re-hashing
  `canonical(record.snapshot)` on read.
- The component pilot snapshot pins `schemaVersion: 1`, `kind: "component-pilot"`
  and the literal `nativeLibrary: "gated-on-instance-override-proof"`. All three
  are hash-covered, and `validateComponentSnapshot` throws when the stored hash
  does not equal the digest of the body. `componentProperties` is the exact key
  set a measurement fills, so **adding a property invalidates every stored
  snapshot hash**.
- Mode output pins `schemaVersion: 1`, `kind: "mode-trial"`, and its published
  `manifest.json` carries `{ schemaVersion, generation, manifest, sha256 }`.

### Determinism

Tokens are sorted by `localeCompare` (names, typography variants, extras),
spacing sorted numerically, `unmappedVariables` sorted, and theme membership
filtered then sorted before comparison. Serialization is
`JSON.stringify(..., null, 2)` plus a trailing newline. Unstable ordering changes
the hash and so looks like drift.

### Version pinning

`loadInstalledMarwes` resolves `@marwes-ui/react|vue|svelte` from the project,
then resolves `@marwes-ui/core` *from that component package*, and takes
`versions.core` as the snapshot version. `familyProblems` fails any mix of
versions across `react`, `vue`, `svelte`, `core` and `presets`. The required core
exports are `resolveThemeInput`, `themeToCSSVars` and `mwThemeVars.spacing`.

### Native component generation is hard-gated

`marwes components build` always throws: native library generation requires first
proving preserved text and style instance overrides against the pinned Penpot API
in an owner-authorized scratch file. **Removing that throw is a policy change,
not a feature.**

### Redaction

The MCP URL carries a personal key. Five separate sites throw rather than write
when `context.redact(text) !== text` (`commands.ts` three times, `components.ts` and
`mode-trial.ts` once each), and a journal that needed redaction forces
`complete = false` / `verified = false`. Never print or commit an unredacted URL.

### Declared bounds

50 000 shapes and 50 000 tokens; 5 000 tokens, 500 000-character source and
500 000-character resolved payload in a mode read; 100 sources, 60 cases, an
8192-pixel viewport and 4 MiB inputs and renderer output for components; 1–20
declared themes for a mode trial; 50 extra sets and 10 000 extra tokens; 1 000
lint suppressions. Config paths must be relative and free of `..`, and
`marwes.name` must match `/^[A-Za-z][A-Za-z0-9 _-]{0,40}$/`.

### Exit codes are contract

`0` verified, `1` failed or unrestored, `2` stale or drifted, `3` incomplete,
`4` uncertain.

## Side Effects

- **Network: only through `PenpotToolClient`** (`context.withPenpot`) — `runSnippet`,
  `exportShapePng`, `createCheckpoint` and `readJournalTarget` against the Penpot
  MCP proxy. There is no `fetch` and no HTTP client in this directory.
- **Files read**: `penpair.config.json` via `loadConfig`/`readRawConfig`; the
  adapter's own `../package.json` via `createRequire(import.meta.url)` for
  `adapterVersion`; the committed token snapshot at `settings.snapshot`;
  `--from` and `--ownership` JSON via `readDesignJson`; the ownership ancestor via
  `readSyncAncestor`; the journal via `readJournal`; the component pilot
  `snapshot`, `renderer` and `sources` files through `boundedRead` →
  `resolveProjectInput` under a 4 MiB cap; and the `package.json` of each
  `@marwes-ui/*`.
- **Files written**, all through `atomicWriteFile` with paths resolved by
  `resolveProjectOutput` and parents created with `mkdir -p`: the token snapshot;
  the `--adopt` proposal; `--out` preview and migrate files; `pilot.snapshot` for
  `components snapshot --write`; and the mode-trial output tree — a staging
  directory `<out>/.<uuid>` renamed to `<out>/<uuid>` holding `1.png`…`N.png` plus
  `manifest.json`, with a top-level `<out>/manifest.json` pointer and an `rm -rf`
  of the staging directory in `finally`.
- **Ledger writes are locked**: `mkdir` at mode `0o700`, an exclusive
  `<dest>.lock` created `wx` at mode `0o600` and unlinked in `finally`, then
  `atomicWriteFile` at mode `0o600`. A concurrent advance throws rather than
  overwriting. `ensureGitignoreEntry` adds a `.penpair` entry to `.gitignore`.
- **Executes project code**, and this is trusted local code, not a sandbox:
  `loadInstalledMarwes` dynamically imports the installed Marwes core;
  `loadThemeInput` runs the project's theme TypeScript through `jiti`
  (`interopDefault: true`, `moduleCache: false`); and `components.ts` evaluates
  the project's renderer module through `jiti` (`moduleCache: false`,
  `tryNative: false`) and calls its `measure(cases)`. `resolveProjectInput` bounds
  only the entry path, never its transitive imports.
- **stdout/stderr**: `print` → `context.output?.log ?? console.log`,
  `diagnostic` → `context.output?.error ?? console.error`, with structured
  results also passed to `context.output?.result(...)` and progress flowing
  through `onStep` / `context.log`.
- **Timing**: a 100 ms `commandSleep` between resolution samples, a
  `withCleanupDeadline(..., 10000)` for restoration, and 10 s snippet timeouts on
  mode reads and writes. There is no in-process cache.
- No `child_process` spawning, and no `process.env` reads, anywhere in this
  directory.

## Verification

- Run: `pnpm test` (from `packages/marwes-ui`)

`pnpm check` is the repository's full gate, but its first step shells out to
`git ls-files`, so it cannot run in a tree without a `.git` directory.
