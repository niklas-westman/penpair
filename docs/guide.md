# Guide (skeleton)

The contract an adopting project works through. It grows with the code; each section ends in a checklist like Reflection's provider guide.

## Extension points
| Point | A project supplies | First implementations |
| --- | --- | --- |
| Connection profile | endpoint, Penpot version, where the token comes from | local Docker, shared self-hosted, hosted |
| Library adapter | where tokens and components come from; commands the adapter adds, listed under `adapters` in `penpair.config.json` (`defineAdapter` in `@penpair/core`) | `@penpair/marwes-ui` (tokens) |
| Snippet registry | named plugin snippets with inputs and a size check | tree, audit, tokens, archive |
| Verification provider | what "matches the design" means | `penpair baselines` (images and Reflection cases, below), a page-verify gate |
| Skill pack | rules the agent follows | the Penpot skill, design judgment |

## Sections to write
- Starting from an empty machine
- Instances (written, below): one per project, ports, volumes, secrets, backup and restore
- The write protocol
- Writing a snippet
- Writing a library adapter
- What breaks when Penpot is upgraded

## Configuration checks and standalone inspection

`penpair config check` validates `penpair.config.json` offline before loading any adapter or project snippet. `--json` returns `{ "valid": true, "file": "penpair.config.json" }`, or `valid: false` with an error code and message (exit 1). Missing, unreadable, malformed JSON and invalid core settings are reported separately. Adapter-owned blocks are preserved; each adapter validates its own settings when used.

Print the editor schema with `penpair config schema > penpair.schema.json`, then add `"$schema": "./penpair.schema.json"` to your config. The schema command works even while the project config is broken and executes no project extensions. It is also exported as `projectConfigSchema` from the library. `config check` additionally checks semantic constraints such as distinct ports and unique baseline IDs.

An existing invalid config stops project commands before endpoint discovery or extension imports. Fix the named field or file permissions and rerun `config check`; `--any-instance` cannot bypass invalid configuration. Setup and init create a config only when it is genuinely absent, never when an existing file is unreadable or invalid.

For inspection from a folder with **no** config, explicitly use `--standalone`, for example `penpair pages --standalone`. Supported commands: `pages`, `tree`, `audit`, `tokens dump`, `export`, and the ordinary read-only `probe`. Endpoint resolution then uses the usual environment, `.env.local`, or agent configuration, so check the endpoint source in the probe. Export may save a local image, and page-scoped reads may switch the editor page. Standalone mode cannot bypass an existing config, run registered snippets, or perform document writes (including `probe --deep --write`). Write commands require a project configured with `penpair setup` or `penpair init`.

## Connected-file protection

Add `"file": { "id": "<file-id>", "name": "Shared design" }` to `penpair.config.json`, or run `penpair connect --pin-file` to record the connected file after checking its name and ID. Setup/connect offer to pin an unconfigured file; only a positive answer writes the pin. Existing pins are never replaced by reconnecting to another file. Commit the pin; colleagues keep their own MCP keys.

Every delivered execution checks the pinned ID inside the editor. Writes, deep probes, adapter calls and file-specific exports/baselines refuse a mismatch, even if the file changed after inspection or between batches. Basic `pages`, `tree`, `audit`, token reads and ordinary probes warn and identify the actual file. Older configs remain usable with an unpinned warning. `--any-file` explicitly overrides the file guard for one command; it does not override the instance guard. Doctor reports expected/actual identity, including under `--json`. Names may change; the file ID is the authority.

## Instances
One Penpot per project, configured in `penpair.config.json` (no secrets, commit it):

```json
{ "instance": "my-app", "penpotVersion": "2.18.3", "ports": { "frontend": 9002, "mail": 1081 }, "directory": ".penpair" }
```

| Command | What it does |
| --- | --- |
| `penpair setup [--web \| --docker]` | The guided path: where is Penpot, config, start it if it is Docker, take the key (hidden), wait for the editor, read the file, install the skills |
| `penpair connect [--replace]` | Only the key and the wait for the editor; accepts a pipe (`pbpaste \| penpair connect`) |
| `penpair init [--instance <name>] [--port 9002] [--gitignore]` | Writes the config if missing, the compose file, and a secrets file (owner-only) that is never replaced |
| `penpair up` / `down` / `status` | Start (waits until the backend answers), stop (the data volumes stay), look |
| `penpair doctor [--json]` | Docker, secrets, containers, frontend, backend, then the editor and plugin through the MCP, and that `.env.local` is kept out of git (a web project checks only the address, the editor and the key file) |
| `penpair backup` | A Postgres dump and a tarball of the assets, with checksums and counts, in `.penpair/backups/` |
| `penpair backup verify <dir>` | Restores the dump into a throwaway database and compares counts, revisions and asset files |
| `penpair restore <dir> --yes` | Replaces the instance's data; a safety backup of the current data comes first; the counts are compared afterwards |

Things to know:
- Two instances never collide: the compose project is `penpair-<instance>`, so containers and volumes have their own names. `composeProject` in the config adopts an instance that was started earlier under another name.
- Keep `.penpair/` out of git. Backups hold account data (password hashes).
- The database password must not change while the database volume exists; the secrets file is never regenerated.
- The frontend answers a few seconds before the backend; `up` and `doctor` look at `/readyz`.
- `doctor` compares the MCP key's port with the instance's, because a key for another instance silently drives the wrong file.
- Penpot's accounts come from the first registration in the browser; the MCP key is made in Account, Integrations, MCP Server and goes in `.env.local` as `PENPAIR_MCP_URL`.

Native capability presence appears in `penpair probe`; `penpair probe --integrity` optionally checks file referential integrity without changing the document. Unsupported integrity checks are explicit, not successful validation. See [native API compatibility](compatibility.md#capability-driven-native-apis).

## Retry safety and uncertain writes

Penpair retries suspended executions only when explicitly classified as reads. Writes and unclassified scripts are delivered once, even if a caller requests retries. A lost response, timeout, suspended-tab failure or failed mutating snippet reports `write-uncertain` with a run ID. Inspect the intended file independently and reconcile existing objects before explicitly running another write. Run IDs identify executions; they do not provide transactions, deduplication or rollback.

Library callers pass `effect: "read"` only for code they trust to be read-only. Registered read snippets and built-in reads carry that classification. Operation inspect/readback phases are reads and apply is a write; adapter mutations and deep probes use the same policy. Successful snippet reports include `execution.runId` and `outcome: "ran"`; this means a result was received, while operation verification remains a separate step.

## Verified operations

A received result (`execution.outcome: "ran"`) is an acknowledgment, not verification. An operation reports `outcome: inspected`, `verified`, or `failed`; an ambiguous apply throws `write-uncertain`. Inspect/apply require explicit `ok: true`. Readback must supply real observations; empty objects, primitives and `problems: []` alone do not verify a write. Failed independent verification retains inspect/apply/readback evidence in the report and causes CLI writes to exit nonzero.

For registered writes, supply an explicit `verify({ inspect, apply, readback })` returning a list of problems, or return `verification: { expected: { count: 2 }, actual: { count: measuredCount } }` from readback. Both observations must be nonempty objects; the default verifier compares them structurally. Read `actual` from the real file independently. Code that copies its expected values into actual is not independent evidence. The verifier and read declarations remain trusted project code. Structural verification, visual review and owner approval are separate steps.

## Baselines for a check

`penpair baselines` hands a page's design to a check that compares the implementation against images. It reads the `baselines` block of `penpair.config.json`:

```json
"baselines": {
  "page": "Candidate",
  "root": "tests/baselines",
  "threshold": 0.05,
  "frames": [
    { "frame": "F / candidates", "id": "candidates-desktop", "route": "candidates" },
    { "frame": "F / my work", "id": "my-work" }
  ]
}
```

- `frame` is the exact name of a top-level frame on the page; two frames with the same name is an error, so the reference is never ambiguous.
- `id` names the image (`<id>.png`) and the check. `route` is the route in your app this frame is the design of; a frame without a route is exported but gets no check.
- Without `--apply` the command only looks and reports each frame as `new`, `same`, `changed`, `unstable` (the export never settled) or `missing`. `--apply` writes new images, `penpair-baselines.json` (file, revision, sizes, hashes) and `reflection-cases.json`. A `changed` image is replaced only with `--apply --update`: that is the act of approving the new design, and the owner's call. The exit code is 2 when a design differs from its image, 1 when a frame is missing or unstable.

The generated `reflection-cases.json` holds, per route, the viewports (the image's exact size) and the `visualSmoke` cases (review-only, `strict: false`). A Reflection config uses it like this; only the route's own expectations are written by hand:

```ts
import { defineReflection } from 'reflection-check';
import cases from './tests/baselines/reflection-cases.json' with { type: 'json' };

export default defineReflection({
  project: 'my-app',
  run: { defaultMode: 'smoke', ciMode: 'smoke' },
  contracts: {
    browser: {
      enabled: true,
      blocking: true,
      baseUrl: 'http://127.0.0.1:5173',
      routes: [
        { id: 'candidates', name: 'Candidates', path: '/candidates', viewports: cases.routes.candidates.viewports, expects: [{ screenshot: 'final' }] },
      ],
      visualSmoke: cases.visualSmoke as never,
    },
  },
});
```

`baselineRoot` in the generated cases is relative to the Reflection config's folder, so keep the two in the same project root. The same images work with any other image comparison; the Reflection cases are one output of the manifest.

The percentage a comparison reports is not a verdict: a correct implementation differs from a Penpot render by about 1 to 2% on text alone, so read the diff image.

Interrupted write recovery, run inspection and optional checkpoints: [recovery guide](recovery.md).

Baseline schema 2 keeps current capture and original approval provenance separate, publishes immutable image generations, and requires a complete capture. See [artifact publication](artifacts.md) for paths, migration and interruption behavior.

For scripts and tools, use the versioned [command result contract](command-contract.md): command-specific JSON now lives under `data`, progress uses stderr, and incomplete/uncertain/cancelled outcomes have explicit exit codes.

Adapters, snippet definitions and theme files execute trusted project code. Built-in help/inspection avoid adapter imports; use `snippets --builtins-only` for the shipped registry. See [extension trust boundaries](extensions-trust.md).

Use `skills install --agents AGENTS.md --dry-run` to preview owned-marker instruction integration, then repeat without dry-run. Default destination selection and conflicting instruction files are explained in [skill installation](skill-installation.md).

Use `export --name <exact-name> --page <page> <out.png>` when a rebuild changed IDs, or `shots --page <page> --prefix <prefix>` for ad-hoc captures without baseline approval. See [named exports and shots](shots.md).

Normal operations and captures now use [bounded layout settling](layout-settling.md). Layout evidence, independent postcondition checks, stable renders and visual approval remain distinct.
