# Changelog

## Unreleased

- **Project token sets and CRUD:** neutral inspect/apply/readback commands for inactive set creation, same-type token upsert, reference-aware removal and conflict-free promotion copies. Source rechecks, journals and independent complete readback share the write protocol. The token adapter includes declared project extras in both modes; schema-2 snapshots record ownership and retain version-1 review support.

- **Structured inspection:** selected-frame full text, hierarchy, layout, bindings and provenance with explicit unknowns; bounded Unicode-safe transfers, stale-cursor rejection and measured request/response budgets. Typed token dumps preserve composites; tree/audit previews expose truncation and totals. Incomplete or credential-redacted captures refuse artifact publication. See `docs/inspection.md` for versioned formats and legacy token migration.

- **Bounded layout settling:** operation verification, recovery, exports and token pushes now prefer native completion or bounded geometry polling instead of an unconditional ten-second sleep. Request budgets propagate through guards to the SDK; malformed/late/timeout samples cannot pass. Two matching exports and independent postconditions remain required, and reports retain measured layout evidence.

- **Named exports and shots:** exact page-scoped shape lookup refuses ambiguous names, incomplete search and stale lookup/capture identity. Ad-hoc shots reuse stable exports, publish complete immutable generations and carry capture provenance without approving baselines. CLI option typos gain explanatory hints without automatic reinterpretation.

- **Instruction integration:** skills install/setup can target `--agents <path>`. The installer owns only marked skills rows, preserves other instructions, refuses malformed markers and ambiguous default files, and exposes resolved paths. `skills install --dry-run` previews all files/links and the instruction diff without writes. Local output paths reject symlink escapes and dangling links; repeated installs remain idempotent.

- **Dated build gotchas:** thirteen hosted-2.18.4 reports now appear in the shipped neutral skill and compatibility reference, explicitly distinguished from new live reproductions. Doctor suggests a visible separate editor window; write suspension guidance follows the no-replay policy.

- **Explicit extension trust:** built-in commands/help avoid adapter imports; help lists configured extension names. Built-in snippet runs avoid project modules, and `snippets/run --builtins-only` gives an explicit restricted registry. Local adapter/snippet/theme entry points reject real-path escapes; read declarations remain trusted code. Added literal design-data formatting and quoted tree labels.

- **Versioned command contract:** `--json` now emits one shared envelope; earlier JSON roots move under `data`. Core and bundled adapter results retain completeness, target/run evidence and structured errors. Added explicit incomplete/uncertain/cancelled/deadline exits, cooperative request cancellation, strict flag/numeric validation, and structured MCP executor-envelope support with legacy text compatibility.

- **Artifact provenance and safe publication:** schema-2 baseline manifests separate capture and approval identity/revision/hash. Complete coherent runs publish immutable capture generations before atomically publishing the manifest; missing/unstable captures preserve previous output. Generated Reflection cases follow approved paths. PNG/archive outputs stage complete bytes; archives retain exclusive no-replacement behavior.

- **Team safeguards:** offline `onboard [--json]`, local checkout writer locks and capability-driven shared advisory markers for journaled writes. Explicit abandoned-lock override, lease expiry and independent ownership checks; same-execution revision, archive-source and token-source guards stop stale mutations. Cross-machine markers are explicitly non-atomic.

- **Recoverable writes:** local redacted journals persist original plans and started/completed phases for CLI writes and adapter token batches. Explicit `--resume` reconciles actual state, skips verified work and refuses conflicting inputs or edits. `runs` inspects evidence offline; optional `--checkpoint` requires verified native version support. No transaction or automatic rollback.

- **Hosted backup candidates:** bounded `backup file <new.penpot>` exports with identity/revision/length/hash evidence and refusal to replace existing files. Exported bytes never imply a verified restore. Added manual export/scratch-restore guidance and opt-in non-blocking backup-note reminders; the first real archive round trip remains outstanding.

- **Capability-driven native support:** versioned probe metadata and optional `probe --integrity`, bounded native/fallback layout waiting, explicit unsupported/failure results, and run-keyed optional version checkpoints with independent readback. No Penpot version bump or new live-compatibility claim.

- **Transport reliability tests and opt-in scratch smoke:** a real HTTP fake exercises the installed MCP client, including lost write responses. The manual `smoke:live` harness pins origin/file/version and refuses unconfirmed targets; its workflow requires a connected editor and a protected environment. Empty/incomplete deep-check evidence cannot pass. Added generated token-storage normalization invariants.

- **Verified writes require observations.** Empty/missing/primitive readbacks and an empty error list no longer count as success. Registered writes need an explicit verifier or matching expected/actual observation objects. Failed readback/verifier results retain the applied evidence, and adapter token/structure reads reject missing evidence.

- **Ambiguous writes are never retried automatically.** Only classified reads retry suspended requests; write/unknown failures report `write-uncertain` and a run ID. Operations, adapter mutations and deep probes use the same conservative policy; received snippet results include execution metadata separately from verification.

- **File identity guards**: optional `file.id` pin, offered by setup/connect (`--pin-file`), checked inside every delivered execution including adapter batches and deep probes. Basic reads warn; writes/artifacts refuse another file. Doctor reports expected/actual IDs; `--any-file` is an explicit override.

- **Invalid project configuration stops commands before connecting or loading extensions.** Missing files are distinguished from unreadable files, malformed JSON and invalid settings. `penpair config check [--json]` validates core settings offline, and `penpair config schema` prints editor hints. Config-free built-in inspection now requires `--standalone`; it cannot bypass a configured project or run document writes/snippets. Setup/init only create a config when the file is genuinely absent.
- **`penpair-setup-guide`**, a skill for Claude Code, Codex and GitHub Copilot that walks a person from nothing to a first design: Node check, web or Docker, a Penpot account, where the MCP link goes (never through the chat), the plugin, `doctor`, the optional Marwes adapter, the agent rules and a test POC on its own page. It lives in `skills/` in the repository; an assistant can read it by URL or it can be copied into a project. The README now starts with it. It works from the file alone (package map, commands, raw links), and `references/poc-snippet.mjs` is a starting snippet for the first POC.
- **`penpair init --external` now names the browser steps before `connect`**, since `connect` waits for the plugin; it used to say only `next: penpair connect`.

## 0.1.3

Found on the first real run of the Marwes adapter against a hosted Penpot file.

- **`marwes tokens push --apply` no longer reports font families as different.** Penpot stores a font family token as a list (`["Instrument Sans"]`) however it was written, so the read-back check failed for the font tokens even though the file was right. The comparison now treats the string and the list as the same value; the test double behaves like Penpot here.
- **`penpair skills install` and `penpair setup` reuse the folder where the skills already are** (`.skills`, `.claude/skills` or `.agents/skills`) instead of adding a second copy in `.skills`. The install report says which folder it used.

## 0.1.2

- **`@penpair/marwes-ui`**, the Marwes UI adapter: `penpair marwes tokens snapshot | check | diff | push | status`. Marwes tokens and the project's own theme as Penpot token sets, a committed snapshot, an offline `check` for CI that fails when Marwes or the theme moves, a `diff` that shows what each change reaches (shapes bound to the token), and a verified `push`. Records Marwes variables it does not turn into tokens, so a new kind of variable cannot slip by. See `docs/marwes-tokens.md`.
- **Adapters in the core**: a project lists `adapters` in `penpair.config.json`; an adapter (`defineAdapter`) adds commands and keeps its settings in its own block. The core loads them by name from the project and knows nothing about any of them.
- **The Penpot skill is now `penpair-design`** (it was `penpot-design`), so it matches `penpair-setup` and no longer collides with a project's own `penpot-design`. `penpair skills install` tells you when the old folder is still there and carries your `project-facts.md` over to the new one.
- Found while building it: assigning a typography token's value in Penpot stores it un-normalised; the adapter removes and adds those again.

## 0.1.1

The packages are split so that each way of running Penpot has its own command package, and `@penpair/core` is a pure library.

- **`@penpair/web`**: the `penpair` command for Penpot on the web (the default). Install this one.
- **`@penpair/docker`**: the same command with the Docker commands added (`up`, `down`, `status`, `backup`, `backup verify`, `restore`). It includes everything in the core, so install it instead of `@penpair/web`, not beside it.
- **`@penpair/core`**: the library and engine, with the skills. It no longer has a command, and it knows nothing about Docker: it offers a plug-in point (`runCli`, `LocalProfile`) that `@penpair/docker` uses.
- Version 0.1.0 of `@penpair/core` contained the command and the Docker code together; Docker users of 0.1.0 move to `@penpair/docker`.
- `penpair` (the short name for `@penpair/web`) waits for npm to allow the name.

## 0.1.0

First version. Published as `@penpair/core`; the short `penpair` wrapper waits for npm to allow the name.

- `penpair setup`: one guided command from nothing to a working connection. Penpot on the web is the default (design.penpot.app or your team's own); Docker on your computer is the alternative.
- `penpair connect`: takes your personal MCP key without showing it, refuses a key that belongs to another Penpot, stores it in a git-ignored `.env.local`, waits for the editor and plugin.
- `penpair doctor [--json]`: what works, what does not, what to do about it; also that `.env.local` is kept out of git.
- Read and write your Penpot file safely: `pages`, `tree`, `audit`, `tokens dump|diff`, `export`, `archive`, `probe` (and `probe --deep --write`), `run` for your own snippets. A change looks first, writes once and reads back.
- `penpair baselines`: export a page's frames as approved reference images with a manifest and ready-made Reflection cases; a changed design is replaced only with `--update`. Run end to end against Reflection.
- Skills for AI agents, installed with `penpair skills install`: `penpair-setup`, `penpot-design`, `design-judgment`.
- Docker, as its own opt-in package `@penpair/docker`: one Penpot per project with generated secrets, `up`, `down`, `status`, `backup`, `backup verify`, `restore`. Web users carry none of it; without the package the command says how to install it.
- Checked against Penpot 2.18.3 (Docker) and the hosted Penpot 2.18.4; see `docs/compatibility.md`. Not proven yet: a large file with a shared library on the hosted service, paid plans, two editors in one file, and a full `.penpot` export and import round trip.
