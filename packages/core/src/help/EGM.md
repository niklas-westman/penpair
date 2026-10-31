# help

## Overview

`penpair help` — the offline command catalogue. It answers "what commands exist,
what flags do they take, and what should I read next" without a Penpot
connection, without a configured project, and without executing anything.

The catalogue has two halves. Core topics are derived from the same declarations
the argument parser uses, so help cannot drift from the real flag set. Adapter
topics are read from a **static JSON manifest** that each adapter package ships,
which is why asking for help never loads an adapter's code.

That second point is the reason this directory exists as a boundary. Help is the
one command a person runs when something is already broken, so it must not
depend on the things that break: no network, no editor, no project module
evaluation, and no failure mode worse than a missing topic.

## Interface

**Request detection and entry point** (`command.ts`)

- `isHelpRequest(argv)` — true for an empty argument list, a leading `help`
  word, `--help`, `-h`, or `--help-id[=ID]`. The unfiltered overview (no ID, no `--all`, no `--search`) opens with a "New here?" block listing the five setup commands in order; a test fixes that order.
- `runHelp(argv, root, local, configured?)` — renders the catalogue and returns
  an exit code.

**Core catalogue** (`catalog.ts`)

- `coreHelpTopics(local)` — the built-in topics, assembled from
  `../command-options.js`, `../adapters.js` reserved names and
  `../design-commands/options.js`. The topic set is the same either way; with
  `local` false, the Docker-only topics (`up`, `down`, `restore`) carry
  `availability: "Requires the local-instance command package."`.
- `HelpTopic` — the record every topic conforms to, core or adapter: `id`,
  `group`, `summary`, `usages[]`, typed `flags[]`, `instructions[]`,
  `related[]`, optional `availability`.

**Adapter discovery** (`adapter-help.ts`)

- `adapterHelp(root, configured?)` → `{ topics, notices }`. Resolves each
  configured adapter's manifest and returns the topics it declares, plus
  human-readable notices for whatever could not be read.

**Content** (`command-data.ts`, `topics.ts`, `flag-guidance.ts`,
`release-guidance.ts`)

- `commandData`, `workflowTopics`, `flagGuidance`, `releaseGuidance` — the
  per-command text, the workflow groupings, and the flag and release-step
  guidance the renderer folds into a topic.

## Invariants

- **Help never executes project code.** `adapterHelp` resolves
  `<package>/package.json`, reads the `penpair.help` path it declares, and
  parses that file as JSON. It never imports the adapter's entrypoint. The
  comment at `adapter-help.ts:13` states this; keep it true, because an adapter
  that could run during `--help` would make help unusable exactly when it is
  needed.
- **Only static, bounded JSON is read.** `staticJson` refuses any help input
  over its byte budget with `"Help input exceeds its byte budget"`, applied both
  to a package manifest and to the help file itself.
- **A manifest path may not escape its package.** The declared path must be a
  string beginning `./` with no `..` segment, and the resolved `realpath` must
  still sit inside the package directory — so a symlink cannot redirect help at
  an arbitrary file. Adapter names are additionally matched against a
  package-name pattern before resolution.
- **Discovery degrades, it does not fail.** An unreadable project
  configuration, an adapter without a manifest, or a malformed manifest produces
  a `notices` entry and leaves the core catalogue complete. `penpair help` must
  keep working in a directory with no project at all.
- **Only help grammar is parsed.** `runHelp` parses the help flags and nothing
  else; no project command is parsed or dispatched from here. A help request
  must never have side effects on the project.
- **Core topics are derived, not duplicated.** Flags come from
  `../command-options.js` and the design-command option tables rather than being
  restated here. A new flag must appear in help without anyone editing this
  directory; if you find yourself hand-listing a flag, the derivation is broken.
- **Every topic satisfies `HelpTopic`**, whether it came from the core or from an
  adapter manifest, so the renderer has one shape to handle.
- **Adapter manifests are validated, not trusted.** `schemaVersion` must be `1`,
  there may be at most 200 topics, topic ids are dotted kebab-case, and each
  topic's `group` is overwritten with `Adapter <name>`. A manifest that fails
  any check produces a notice, not an error (`adapter-help.ts`).

## Side Effects

- **Filesystem reads only**: the project's `penpair.config.json`, each
  configured adapter's `package.json`, and each declared help manifest. All
  size-bounded; all resolved through `realpath` and confined to the owning
  package.
- **Writes nothing.** No files, no journal entries, no configuration.
- **No network, no MCP, no Penpot.** This command is fully offline by design.
- **stdout contract**: `runHelp` prints the rendered catalogue, or a JSON
  document when `--json` is given, and returns an exit code. Notices are part of
  the output, not thrown errors.

## Verification

- `pnpm test` from `packages/core` — `test/help-catalog.test.ts` covers the core
  catalogue and one happy-path discovery of a static installed adapter manifest.
  `test/adapter-help-manifests.test.ts` checks that the shipped adapters' help
  manifests match the parser vocabulary. The refusal paths in `adapter-help.ts`
  (byte budget, `..`, symlink escape, topic count, `schemaVersion`) are implemented
  but not tested.
- `penpair help --all`, `penpair help --search <term>` and
  `penpair help <topic>` exercise it by hand. See
  [CLI help and streaming progress](../../../../docs/cli-help-progress.md).
