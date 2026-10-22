# penpair: plan

Living checklist. Source of the first draft: Sourcer's `design-governance/docs/penpot-kit-packaging-plan.md` (2026-10-20).

## What it is
**Design together. Build together.** A framework that makes a Penpot design file the source of truth for a project's UI and lets people and AI agents work on it together: run an instance per project, drive it safely through the MCP and plugin API, ship the know-how as skills, extend it with adapters. Sibling of Reflection (which checks the implementation against the design).

## Principles
- A framework first: neutral core, extension points, nothing project-specific inside (enforced by a test).
- Web Penpot first: the default is to connect to a Penpot on the web (hosted or team-run, the external profile); a Docker instance per project on the owner's computer is the documented alternative, not the priority.
- Penpot is the authority; the repository holds snapshots and readable manifests, not the live file.
- Honest about limits: tied to Penpot's plugin API, needs an open editor tab, not headless.

## First consumer: Tradient. Second: Sourcer.
Tradient (pnpm monorepo, trading journal on `@marwes-ui/react`) gets its own instance and is the first test of the Marwes adapter. Sourcer moves onto the kit afterwards, so it stops depending on Tradient's untracked `penpot-poc/` folder.

## Now
- [ ] **Branch review — locally eligible work complete; live and owner gates pending** Continue the [living improvement checklist](docs/improvements.md) on `codex/penpair-improvements`; review the full branch before merging.

## Phases
### 0. Done in Sourcer before extraction
- [x] Backup of the local instance and a restore into a throwaway Postgres (counts and revision match)
- [x] Endpoint from the shell or a git-ignored `.env.local`
- [x] Probe of what a Penpot and its MCP offer (`scripts/penpot/probe.mts` in Sourcer)
- [ ] Fold the newly found quirks into the Penpot skill reference
- [ ] `.penpot` round trip: export from the editor, import into a scratch instance, compare tree and tokens
- [ ] Hosted-Penpot probe (needs the owner's account)

### 1. Core
- [x] **R2 — Temporary short-name publishing exception** (2026-10-22). Explicit repository variable omits only `penpair`, retains six-package versioning and verifies every other package; release logs/summary disclose the exception and re-enabling supports explicit catch-up.
- [x] **R1 — Reviewed whole-family Changesets releases** (2026-10-21). One fixed group, generated version PR, exact merged-PR publication gate and manual recovery; real package versions remain unchanged. Owner activation remains pending in [release setup](docs/releasing.md#one-time-owner-activation).
- [x] **H2 — Evidence-qualified unsent upstream request draft** (2026-10-21). Upstream asks now distinguish observed source contracts and historical measurements, avoiding requests for capabilities that already exist. Validation and limits: [delivery report](docs/improvements.md#h2-completion-2026-10-21).
- [x] **G2 — Owner-gated trusted publishing and exact release confirmation** (2026-10-21). A reviewed release can use short-lived CI authentication/provenance without losing existing lockstep/package guards or silently publishing an unintended version. Validation and limits: [delivery report](docs/improvements.md#g2-completion-2026-10-21).
- [x] **A4 — Private file and OS credential references** (2026-10-21). Projects can resolve personal MCP credentials from private storage without copying them into repository connection files or exposing provider output. Validation and limits: [delivery report](docs/improvements.md#a4-completion-2026-10-21).
- [x] **C4 — Advisory theme-family hue gaps** (2026-10-21). Projects can spot unchanged brand-family defaults after a primary-color change while retaining intentional contrasting brand choices. Validation and limits: [delivery report](docs/improvements.md#c4-completion-2026-10-21).
- [x] **F3 — Configured advisory audits and explicit unknown evidence** (2026-10-21). Design review can now surface contrast, composition, target-size, naming and text signals without presenting inferred semantics or missing observations as compliance. Validation and limits: [delivery report](docs/improvements.md#f3-completion-2026-10-21).
- [x] **F2 — Observed project health and pinned public file opening** (2026-10-21). Web and local projects now have a shared status view that separates connected facts from missing evidence, plus an explicit public file-opening command. Validation and limits: [delivery report](docs/improvements.md#f2-completion-2026-10-21).
- [x] **F1 — Concise documentation paths and generated troubleshooting** (2026-10-21). First-time readers now have a short quick start and clear person/agent/team/workflow paths, with repair guidance linked to the actual core error inventory. Validation and limits: [delivery report](docs/improvements.md#f1-completion-2026-10-21).
- [x] **I10 — Versioned schema envelopes, explicit migrations and portable tokens** (2026-10-21). Persistent artifacts now have discoverable versioned schema envelopes and explicit migration/exchange paths instead of relying on implicit format assumptions. Validation and limits: [delivery report](docs/improvements.md#i10-completion-2026-10-21).
- [x] **E3 — Focused recipe and handoff skills** (2026-10-21). Agents now have concise construction and handoff workflows aligned with the implemented guarded commands, rather than an expanding all-purpose operations skill. Validation and limits: [delivery report](docs/improvements.md#e3-completion-2026-10-21).
- [x] **D3 — Deterministic page-split structural review snapshots** (2026-10-21). Design structure, text, bindings and token changes can now be reviewed as bounded versioned artifacts rather than only opaque pixels. Validation and limits: [delivery report](docs/improvements.md#d3-completion-2026-10-21).
- [x] **D2 — Exact-artifact owner words and explicit baseline waivers** (2026-10-21). Changed references can no longer silently become approved through an update flag alone; supplied owner words are bound to exact capture evidence. Validation and limits: [delivery report](docs/improvements.md#d2-completion-2026-10-21).
- [x] **E1 — Explicit-root typed stdio MCP services** (2026-10-21). Agents can use bounded project-specific tools through the same command services with a lifetime file pin and no mutable process-directory routing. Validation and limits: [delivery report](docs/improvements.md#e1-completion-2026-10-21).
- [x] **D4 — Explicit implementation cases and comparison evidence adapter** (2026-10-21). Rich design cases now have an explicit setup/readback bridge instead of being silently compared in a default browser state. Validation and limits: [delivery report](docs/improvements.md#d4-completion-2026-10-21).
- [x] **D1 — Structured design handoff and offline freshness checks** (2026-10-21). Complete design inspections can now become a reproducible implementation handoff with explicit source identities, mapping hints and unknown semantics. Validation and limits: [delivery report](docs/improvements.md#d1-completion-2026-10-21).
- [x] **H1 — Scoped Tradient follow-up proposal** (2026-10-21). Consumer adoption work is now a concrete owner-reviewable handoff without applying changes outside this repository. Validation and limits: [delivery report](docs/improvements.md#h1-completion-2026-10-21).
- [x] **I9 — Explicit state, theme and responsive coverage** (2026-10-21). Baseline coverage now distinguishes configured capture completeness from approved case intent, unsupported/missing combinations and browser/accessibility work that has not run. Validation and limits: [delivery report](docs/improvements.md#i9-completion-2026-10-21).
- [x] **B2 — Neutral build kit and adapter-owned recipes** (2026-10-21). Reusable plugin helpers replace throwaway preludes while keeping token bindings after value/font changes and keeping library knowledge outside the core. Validation and limits: [delivery report](docs/improvements.md#b2-completion-2026-10-21).
- [x] **B1 — Reviewed plugin bodies from files** (2026-10-21). Project scripts can run through the core file/page/size guards with ordered helpers and literal parameters, rather than a throwaway transport runner. Validation and limits: [delivery report](docs/improvements.md#b1-completion-2026-10-21).
- [x] **C3 — Actual mode resolution and complete selection restoration** (2026-10-21). Declared membership no longer stands in for actual per-theme resolution: isolated mode trials read live resolved values, expose global order drift and independently verify restoration of every original theme/set flag. Validation and limits: [delivery report](docs/improvements.md#c3-completion-2026-10-21).
- [x] **I6 — Ownership conflicts and reference-aware reconciliation** (2026-10-21). Designer edits and upstream changes are distinguished before pushes; unmanaged tokens and retained references are protected during destructive plans. Validation and limits: [delivery report](docs/improvements.md#i6-completion-2026-10-21).
- [x] **C2 — Declared project extras and guarded token editing** (2026-10-21). Project token sets can be recreated from config and participate in snapshot/check/diff/push; one-off token edits use the same guarded write and recovery contract. Validation and limits: [delivery report](docs/improvements.md#c2-completion-2026-10-21).
- [x] **I8 — Structured inspection and measured transfer budgets** (2026-10-21). Full text and typed composites can now be collected without silently treating clipped previews as complete evidence. Validation and limits: [delivery report](docs/improvements.md#i8-completion-2026-10-21).
- [x] **B4 — Bounded layout settling in normal write and capture paths** (2026-10-21). Normal operations no longer treat an unconditional sleep as layout proof, and export/recovery cannot silently accept moving, malformed, late or timed-out geometry. Validation and limits: [delivery report](docs/improvements.md#b4-completion-2026-10-21).
- [x] **B3 — Exact-name exports and complete ad-hoc shots** (2026-10-21). A rebuild no longer requires a separate ID-discovery script before capturing a uniquely named frame, and one-off screenshots no longer need baseline approval configuration. Validation and limits: [delivery report](docs/improvements.md#b3-completion-2026-10-21).
- [x] **E2 — Owned-marker instruction integration and preview** (2026-10-21). Skill installation can integrate its own rows into an explicitly resolved instruction file without manual copy/paste, duplicating rows, or overwriting unrelated instructions. Validation and limits: [delivery report](docs/improvements.md#e2-completion-2026-10-21).
- [x] **B5 — Dated and version-scoped build gotchas** (2026-10-21). The build brief's operational knowledge is now shipped with the design skill instead of remaining in one session, with evidence scope and safe workarounds visible. Validation and limits: [delivery report](docs/improvements.md#b5-completion-2026-10-21).
- [x] **I11 — Lazy executable extensions and explicit trust boundaries** (2026-10-21). Built-in help and inspection no longer execute configured adapters unnecessarily, and selected local executable entry points cannot silently escape the project through traversal or symlinks. Validation and limits: [delivery report](docs/improvements.md#i11-completion-2026-10-21).
- [x] **I7 — Versioned command results and interruption contracts** (2026-10-21). Automation can distinguish completed, drifting, incomplete, failed, cancelled and uncertain commands without parsing human prose or losing truncation evidence. Validation and limits: [delivery report](docs/improvements.md#i7-completion-2026-10-21).
- [x] **I5 — Artifact provenance and consistent atomic publication** (2026-10-21). A new capture can no longer relabel an old approved image with the current revision, and incomplete captures cannot publish a misleading complete manifest. Validation and limits: [delivery report](docs/improvements.md#i5-completion-2026-10-21).
- [x] **A3 — Team onboarding and advisory write coordination** (2026-10-21). Colleagues get a project-specific onboarding checklist, and journaled writers detect ordinary contention and stale revisions/sources before mutation. Validation and limits: [delivery report](docs/improvements.md#a3-completion-2026-10-21).
- [x] **I3 — Recoverable operations and checkpoints** (2026-10-21). Interrupted multi-step writes can now be inspected and explicitly resumed against actual state without blindly replaying completed mutations. Validation and limits: [delivery report](docs/improvements.md#i3-completion-2026-10-21).
- [x] **I4 — Capability-driven native API support** (2026-10-21). Native APIs are detected instead of assumed, and unsupported/throwing methods cannot silently establish layout or file integrity. Optional named checkpoints use explicit apply and independent readback. Validation and limits: [delivery report](docs/improvements.md#i4-completion-2026-10-21).
- [x] **G1 — Transport fault tests and scratch smoke harness** (2026-10-21). The connection path is now exercised over real HTTP through the installed MCP SDK, including authentication rejection, read retry and acknowledgment loss without write replay. Deep checks cannot pass with missing step/cleanup evidence. Validation and limits: [delivery report](docs/improvements.md#g1-completion-2026-10-21).
- [x] **I2 — Require positive verification evidence** (2026-10-21). Empty, missing or primitive readbacks and an empty error list no longer produce verified success. A received acknowledgment is distinct from verified postconditions; malformed or throwing verifiers fail while preserving inspect/apply/readback evidence. Validation and limits: [delivery report](docs/improvements.md#i2-completion-2026-10-21).
- [x] **A2 — Stop ambiguous write retries** (2026-10-21). Suspension or a lost transport response can no longer silently replay a write. Even an explicit retry count cannot enable retries for write or unclassified code; only declared reads retry. Validation and limits: [delivery report](docs/improvements.md#a2-completion-2026-10-21).
- [x] **A1 — Guard the connected file** (2026-10-21). Every delivered execution now checks the pinned file ID; a file switch between inspection and a later mutation cannot silently redirect a write. Basic reads warn; writes, exports, baselines, deep probes and adapter operations refuse mismatches. Validation and limits: [delivery report](docs/improvements.md#a1-completion-2026-10-21).
- [x] **I1 — invalid configuration stops guarded commands** (2026-10-21): shared validated readers distinguish missing, unreadable, malformed and invalid config; errors stop endpoint discovery and extension imports. Offline `config check [--json]`, editor schema, and explicit config-free inspection with `--standalone`. Verified with 31 new regression tests, `pnpm check` (273 tests total), and `pnpm smoke:package`.
- [x] Neutrality test (in place from the first commit)
- [x] Connection and endpoint resolution (shell, env file, agent configuration), with redaction
- [x] `probe` (CLI `penpair probe`; checked live against the local Penpot, same result as Sourcer's baseline)
- [x] `doctor` (docker, secrets file, containers, frontend, backend ready, editor and plugin connected; notices an MCP key that belongs to another instance)
- [x] Safe write runner (`runOperation`: inspect, one write only with `--apply`, settle, independent readback, verify; opens the right page itself)
- [x] Built-in operations and CLI: `pages`, `tree`, `audit` (blank text, unbound colours, overflow, spacing steps, ignore list), `tokens dump` and `tokens diff` (effective values per theme), `archive`, `export` (waits for two identical exports), switch page
- [x] A registry projects add their own snippets to (`defineSnippet`; listed under `snippets` in `penpair.config.json`; parameters with types and defaults; read and write kinds; `penpair snippets`, `snippets check` without a connection, `penpair run <name> --param k=v [--apply]`); the built-in operations are registered the same way
- [x] `penpair baselines` (2026-10-20): the frames of a page, listed under `baselines` in the config, exported at a stable render as approved images with a manifest and ready-made Reflection cases (exact-size viewports, `ref: penpair:<id>`); looks first, `--apply` writes new images, `--update` replaces a changed one (the approval). Unit-tested with a fake client; run live on the hosted Penpot (new, then same on a second run); run end to end through Reflection 0.7.0 (check, expected/actual/diff images and the `ref` all came out). Found: the percentage cannot be the verdict (correct text differs by 1 to 2%, a faint colour shift passes), so the diff image is the signal.
- [ ] Token-set write operations (add, promote, remove) as built-in snippets
- [x] Instance lifecycle: `init`, `up`, `down`, `status`, `backup`, `backup verify`, `restore`; secrets in a 0600 `.env`; unique ports, compose project and volumes per instance (`penpair.config.json`, optional `composeProject` to adopt an existing instance's volumes). Live-tested on a scratch instance: up in about ten seconds, backup, verify (caught a stray asset file), restore (removed what was added after the backup, kept what was in it), down with volumes kept.
- [x] Unit tests with a fake tool client (suspended-tab retry, size guard, redaction, probe)
- [ ] A fake MCP server over HTTP for the connect path, and an automated live smoke test

### 2. Tradient adopts it
- [x] Trial instance on its own port 9002 with separate volumes, in a throwaway folder (`.local/tradient-trial`, compose project `penpair-tradient-trial`): clean `init` and `up` took 16 seconds with the images cached. Not yet in Tradient's repository (needs the owner's go).
- [ ] `doctor` green on a fresh clone in under ten minutes
- [x] Marwes tokens imported through the adapter: built and unit-tested (`@penpair/marwes-ui`); the live push to a Penpot file and Tradient's own use of it are still to do
- [ ] Skills installed; an agent can inspect and export

### 3. Sourcer moves onto the kit
- [ ] Restore proven for the move (the `.penpot` round trip and a full instance restore)
- [ ] Sourcer imports the kit; the existing scripts keep working

### 3b. Easy for non-developers
- [x] First draft of `docs/getting-started.md` for two roles: the designer (browser only) and the person who sets it up
- [x] Followed on the trial instance on 9002 by the owner (account, MCP key, plugin connection): `doctor` all ok, `pages` ok, the deep check passes on the local Penpot too. Still to collect: where the guide's wording did not match what the owner saw.
- [ ] Follow the guide on a clean machine, from nothing (no cached images, no Docker experience) and mark what differs
- [x] `penpair setup` and `penpair connect` (2026-10-20): setup asks where Penpot is (web is the default; `--web [--external <address>]`, `--docker` skip the question), writes the config and `.gitignore`, starts Docker Penpot when chosen, opens the browser, takes the key without echo (a pipe works too) and checks that it belongs to this project's Penpot, writes `.env.local` (0600, git-ignored first), waits for the editor and plugin saying what to do, reads the file once, installs the skills. Run live against the hosted Penpot from an empty folder; the hidden terminal prompt itself is not yet tried by a person on a real terminal. `doctor --json` and a key-file-in-git check added.
- [ ] A person follows `penpair setup` on a real terminal (hidden prompt, browser opening) and reports what differs
- [x] External profile in the code: `penpair init --external <origin>`; no Docker; `doctor` checks that the Penpot answers, that the key belongs to it and that the editor and plugin are connected; the Docker commands refuse politely; every command still acts only on that Penpot. Tested against the local Penpot standing in for a team-run one.
- [x] Hosted Penpot probed (2026-10-20, owner's free account, empty scratch file): the same four tools as a local Penpot (`execute_code`, `high_level_overview`, `penpot_api_info`, `export_shape`); request body 90 KB accepted and 110 KB refused, exactly as locally; responses of 1 MB return; tokens, `uploadMediaData`, `createBoard`, `openPage` and file export are present.
- [x] Hosted Penpot checked on a file with content (2026-10-20, Penpot 2.18.4): `probe --deep --write` passes every step and leaves nothing behind; `pages`, `tree`, `audit`, `tokens dump`, `export`, `archive --apply` and a project snippet that writes (`seed-demo`) all work. Differences and what is not checked: `docs/compatibility.md`. The probe now lists the server's tools first and says plainly if `execute_code` is missing, because everything penpair does goes through it. Penpot's help describes a remote MCP at `https://<domain>/mcp/stream?userToken=<key>` with fewer tools than the local one; whether `execute_code` is among them is not confirmed.
- [x] `skills/penpair-setup-guide` (2026-10-20): a skill any assistant follows to guide a person through the whole setup (web or Docker, account, MCP link, plugin, `doctor`, Marwes or not, rules, a test POC); linked first in the README and from `getting-started.md`. Written from the tested commands; not yet followed end to end by a person.
- [ ] A person follows `penpair-setup-guide` with an assistant from an empty project and reports what differs
- [ ] A short illustrated version (screenshots of each browser step)

### 4. Publish
- [x] Skills pack shipped in the package (`packages/core/skills`: `penpair-design` with the write protocol, the plugin traps including the hosted-Penpot findings, flat auto-layout, a library-in-Penpot note and a `project-facts.md` template the project owns; `design-judgment` with the recipes made project-neutral) and `penpair skills install` (copies, links for Codex and Claude Code, prints the AGENTS.md rows, keeps edited files, never replaces `project-facts.md`). The neutrality test covers the skills too.
- [ ] Owner-reviewed browser screenshots and hosted large-file walkthrough (live verification pending by owner instruction; docs navigation and offline checks are implemented)
- [ ] First outside trial with feedback rounds (like Reflection's)
- [ ] 0.1.0 published (owner): create the `@penpair` npm org and the GitHub repo, push, run the steps in `docs/releasing.md`

## Extension points
Connection profile, library adapter, snippet registry, verification provider, skill pack. See `docs/guide.md`.

## Decided
- Packages (owner, 2026-10-20): `@penpair/core` (the library and engine with the skills; no command; knows nothing about Docker), `@penpair/web` (the `penpair` command for Penpot on the web), `@penpair/docker` (the same command plus Penpot in Docker; depends on the core and includes everything in it) and `penpair` (the short name for `@penpair/web`; waiting for npm to allow the name). One command package is installed, never both, because both own the command `penpair`; the core has none, so nothing clashes. The dependency goes one way only: the command packages depend on the core. Later, with these names so nothing is mistaken for something else: `@penpair/marwes-ui` (the adapter for the Marwes UI library; incubated here, may move to the Marwes repository) and `@penpair/reflection-check` (the link to Reflection's `reflection-check`; today `penpair baselines` in the core). The npm organisation `@penpair` is created by the owner.
- Default path is the external profile (hosted or team-run Penpot); Docker is an alternative, kept and tested but not the priority (owner, 2026-10-20). Consequences: the guide leads with `init --external`; `penpair setup` asks "web or this computer?" and defaults to web; the `.penpot` round trip is first tested against the hosted Penpot with `sourcer-base`.
- Licence: MIT, same as Reflection. Published by the owner, when the owner decides; `packages/core/package.json` stays `private: true` until then.

## Undecided
- Whether the design-judgment skill pack lives here or in its own repository
- Whether the Marwes adapter moves into the Marwes repository once stable
- Whether Sourcer's page-verify gate ships as a product or stays a documented pattern
- Backup destination and who owns the master `.penpot` file

## Change log
- 2026-10-22: R2: added the owner-requested temporary `penpair` publishing exclusion, visible reporting and strict five-package verification; actual activation and publishing remain owner actions.
- 2026-10-21: R1 release follow-up: added Changesets version PRs and API-gated whole-family OIDC publishing, retained recovery guards and prepared the branch PR draft. All automation stays disabled pending owner setup.
- 2026-10-21: completed H2: Evidence-qualified unsent upstream request draft; report in `docs/improvements.md`.
- 2026-10-21: completed G2: Owner-gated trusted publishing and exact release confirmation; report in `docs/improvements.md`.
- 2026-10-21: completed A4: Private file and OS credential references; report in `docs/improvements.md`.
- 2026-10-21: completed C4: Advisory theme-family hue gaps; report in `docs/improvements.md`.
- 2026-10-21: completed F3: Configured advisory audits and explicit unknown evidence; report in `docs/improvements.md`.
- 2026-10-21: completed F2: Observed project health and pinned public file opening; report in `docs/improvements.md`.
- 2026-10-21: completed F1: Concise documentation paths and generated troubleshooting; report in `docs/improvements.md`.
- 2026-10-21: completed I10: Versioned schema envelopes, explicit migrations and portable tokens; report in `docs/improvements.md`.
- 2026-10-21: completed E3: Focused recipe and handoff skills; report in `docs/improvements.md`.
- 2026-10-21: completed D3: Deterministic page-split structural review snapshots; report in `docs/improvements.md`.
- 2026-10-21: completed D2: Exact-artifact owner words and explicit baseline waivers; report in `docs/improvements.md`.
- 2026-10-21: completed E1: Explicit-root typed stdio MCP services; report in `docs/improvements.md`.
- 2026-10-21: completed D4: Explicit implementation cases and comparison evidence adapter; report in `docs/improvements.md`.
- 2026-10-21: completed D1: Structured design handoff and offline freshness checks; report in `docs/improvements.md`.
- 2026-10-21: C1 preparation: measured three-component pilot, source/renderer drift checks, schema-1 snapshots and optional browser example; 519 tests and package smoke pass. Native override proof/generation remain gated. Continue D1.
- 2026-10-21: I12 preparation: controlled scratch examples and offline fixtures pass; runbook/report template added. Human/live trials remain pending by owner instruction. Continue independent C1 tooling.
- 2026-10-21: completed H1: Scoped Tradient follow-up proposal; report in `docs/improvements.md`.
- 2026-10-21: completed I9: Explicit state, theme and responsive coverage; report in `docs/improvements.md`.
- 2026-10-21: completed B2: Neutral build kit and adapter-owned recipes; report in `docs/improvements.md`.
- 2026-10-21: completed B1: Reviewed plugin bodies from files; report in `docs/improvements.md`.
- 2026-10-21: completed C3: Actual mode resolution and complete selection restoration; report in `docs/improvements.md`.
- 2026-10-21: completed I6: Ownership conflicts and reference-aware reconciliation; report in `docs/improvements.md`.
- 2026-10-21: completed C2: Declared project extras and guarded token editing; report in `docs/improvements.md`.
- 2026-10-21: completed I8: Structured inspection and measured transfer budgets; report in `docs/improvements.md`.
- 2026-10-21: completed B4: Bounded layout settling in normal write and capture paths; report in `docs/improvements.md`.
- 2026-10-21: completed B3: Exact-name exports and complete ad-hoc shots; report in `docs/improvements.md`.
- 2026-10-21: completed E2: Owned-marker instruction integration and preview; report in `docs/improvements.md`.
- 2026-10-21: completed B5: Dated and version-scoped build gotchas; report in `docs/improvements.md`.
- 2026-10-21: completed I11: Lazy executable extensions and explicit trust boundaries; report in `docs/improvements.md`.
- 2026-10-21: completed I7: Versioned command results and interruption contracts; report in `docs/improvements.md`.
- 2026-10-21: completed I5: Artifact provenance and consistent atomic publication; report in `docs/improvements.md`.
- 2026-10-21: completed A3: Team onboarding and advisory write coordination; report in `docs/improvements.md`.
- 2026-10-21: completed I3: Recoverable operations and checkpoints; report in `docs/improvements.md`.
- 2026-10-21: G3 partial: bounded archive candidates, backup-note reminders and manual restore guide; 340 tests and package smoke pass. Full hosted round trip and D3 remain pending; proceed with independent I3.
- 2026-10-21: completed I4: Capability-driven native API support; report in `docs/improvements.md`.
- 2026-10-21: completed G1: Transport fault tests and scratch smoke harness; report in `docs/improvements.md`.
- 2026-10-21: completed I2: Require positive verification evidence; report in `docs/improvements.md`.
- 2026-10-21: completed A2: Stop ambiguous write retries; report in `docs/improvements.md`.
- 2026-10-21: completed A1: Guard the connected file; report in `docs/improvements.md`.
- 2026-10-21: completed improvement I1. Invalid/unreadable project config can no longer silently disable the instance guard; setup/init only create genuinely absent config. Added offline config validation/schema and explicit standalone inspection; docs and shipped design skill updated. `pnpm check` and `pnpm smoke:package` pass. Next: A1, connected-file identity.
- 2026-10-20: `penpair-setup-guide` skill in `skills/` for Claude Code, Codex and Copilot; the README starts with it, folds "Add to your repo" into the quick start, and drops stale version numbers.
- 2026-10-20: 0.1.2 prepared with all five packages (including `@penpair/marwes-ui`); published by the owner with `pnpm release --publish --except penpair`.
- 2026-10-20: first live push of the Marwes tokens (271 tokens, hosted Penpot 2.18.4) into a Tradient file worked; the read-back check wrongly flagged font families (Penpot stores them as lists). Fixed with the skills-folder fix in 0.1.3.
- 2026-10-20: `@penpair/marwes-ui` (tokens) and adapters in the core. The core lets a project list `adapters` in `penpair.config.json` (`defineAdapter`, loaded by name from the project; it names none of them). The adapter builds `Marwes · Core`, `Marwes · Dark` and the project's overlay sets from the installed Marwes and the project's own theme file, keeps a committed snapshot (hash, Marwes version, the variables it does not cover), and offers `snapshot`, an offline `check` for CI, `diff` (missing, changed, added by hand, and how many shapes each change reaches), a verified `push` (batched, stops at the first rejection, fingerprints every page's structure before and after) and `status`. Penpot's token API checked live: values update in place except typography (assigned values are stored un-normalised, so those are removed and added again). Run on Tradient's real theme and Marwes 1.11.0: 4 sets, 271 tokens; it found `--mw-density-spacing-multiplier` is not a token. 47 adapter tests plus 10 for the core; a simulated Penpot drives the real push snippets. The live push to Penpot is not yet run (the hosted editor was not connected).
- 2026-10-20: a release guard. All packages always share one version, even without changes: `pnpm check` (and CI) fails on drift, `pnpm bump` moves everything together, every package refuses to be published alone (`prepublishOnly`), and `pnpm release` is the only way to publish: it checks main, clean and pushed, the version everywhere, what npm already has (all or nothing, `--continue` to finish an interrupted release, `--except <name>` to leave one out loudly), runs the checks, publishes in dependency order and verifies the registry. 13 tests on throwaway repositories. 178 tests.
- 2026-10-20: the packages are split cleanly (0.1.1): the core is a pure library with a plug-in point (`runCli`, `LocalProfile`) and no command; `@penpair/web` and `@penpair/docker` are the command packages and depend on it. A first attempt (the core loading the Docker package by name) was dropped: the dependency must go one way. The smoke test found that npm links a dependency's command too, so two packages with the same command name clash; hence one command package per way of running Penpot. Verified from tarballs with npm and pnpm, in four install shapes. 165 tests.- 2026-10-20: `@penpair/core@0.1.0` published (the owner). `penpair` (the wrapper) is refused by npm as too similar to `ecpair`; the owner asks npm support to allow it, and the docs say `npx @penpair/core` until then.
- 2026-10-20: `penpair baselines` and the Reflection hand-off, tested end to end; the README's Reflection section now describes a real command. The richer link (pages and states projected into Reflection's viewer through `reflection-projection`) remains planned.
- 2026-10-20: packaging for 0.1.0: package renamed to `@penpair/core` plus the `penpair` wrapper; Docker code moved to `src/docker` and separated from the connection (a test enforces it); package metadata, README links, `smoke:package`, CI, `docs/releasing.md`, CHANGELOG, SECURITY and CONTRIBUTING. 157 tests; both tarballs install in an empty project and run.
- 2026-10-20: `penpair setup`, `penpair connect`, `doctor --json`, a key-file check, `init --gitignore` also covers `.env.local` for a web project; the skill `penpair-setup` (for an AI agent: recommend web, never see the key, verify with `doctor --json`) with a web-or-Docker reference; the README rewritten around a quick start, an AI section and the web-or-Docker choice. 146 tests.
- 2026-10-20: the default path is now the external profile; `docs/getting-started.md` and the README lead with it and move Docker to an alternative section.
- 2026-10-20: guide followed on the Tradient trial instance; deep check passes on local Penpot 2.18.3 as well. New token sets start inactive on both, which corrects an earlier note.
- 2026-10-20: skills pack and `penpair skills install`. 123 tests. Sourcer's work was committed in seven themed commits on its branch and penpair in three; a clean clone of penpair builds and passes.
- 2026-10-20: `penpair probe --deep --write` (a temporary tagged board, token set and components; flex, text, token binding, component swap, clone, export; clean-up verified by a separate look), run against the hosted Penpot: all steps pass. The first run failed on the token binding, which is recorded a few seconds after the call; the check now waits for it. `docs/compatibility.md` records the matrix. 116 tests.
- 2026-10-20: hosted probe result recorded. The probe also reports the Penpot API version and says when it skipped the shape checks; a test now keeps its plugin code valid (an edit broke it for a while and only the live run showed it).
- 2026-10-20: external Penpot profile (team server or hosted), the probe lists tools and reports a missing `execute_code`, `doctor` for external projects. 108 tests.
- 2026-10-20: snippet registry for projects (`defineSnippet`, loader with per-file problem reports, `snippets`, `snippets check`, `run`), 96 tests; first draft of the getting-started guide.
- 2026-10-20: a command that acts on a Penpot file now refuses an MCP endpoint that belongs to another instance (found when the trial instance's commands reached the Sourcer instance through the agent's global configuration); `--any-instance` overrides. 81 tests. Trial instance for Tradient started on 9002.
- 2026-10-20: instance lifecycle. `penpair init|up|down|status|doctor|backup|backup verify|restore`. Findings from the live test, now fixed: the frontend answers about five seconds before the backend (502 until then), so `up` waits on `/readyz`; the command runner could hang when an output file closed before the child did; a missing command now returns code 127; `doctor` found an MCP key pointing at another instance, so it checks the endpoint's port against the instance. 80 tests.
- 2026-10-20: safe write runner, snippet model (valid-code and size checks without a connection), built-in read and archive snippets, stable export, effective-token diff, and the CLI commands `pages`, `tree`, `audit`, `tokens`, `export`, `archive`. 42 tests. Live read-only run against the local Penpot: `pages`, `tree`, `audit` (matches Sourcer's own audit of the phone frames), `archive` inspect and `tokens dump`/`diff` all behave.
- 2026-10-20: MIT licence added. Core now has the neutral endpoint resolver (shell, `.env.local`, Codex and Claude Code configuration, configurable variable names), the Penpot tool client with failure classification, suspended-tab retry, secret redaction and a 90 KB snippet guard, the capability probe and `penpair probe`. 17 tests; live probe matches Sourcer's baseline (file, revision, APIs, request limit between 90 and 110 KB).
- 2026-10-20: repository created with the plan, agent rules, workspace and the neutrality test. Name chosen by the owner: penpair.
