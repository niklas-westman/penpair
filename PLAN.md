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
- [ ] **Phase 1: the core Tradient needs to start.** Next: a registry projects add their own snippets to, the token-set write operations, and the `.penpot` round trip; then Phase 2, Tradient adopts it.

## Phases
### 0. Done in Sourcer before extraction
- [x] Backup of the local instance and a restore into a throwaway Postgres (counts and revision match)
- [x] Endpoint from the shell or a git-ignored `.env.local`
- [x] Probe of what a Penpot and its MCP offer (`scripts/penpot/probe.mts` in Sourcer)
- [ ] Fold the newly found quirks into the Penpot skill reference
- [ ] `.penpot` round trip: export from the editor, import into a scratch instance, compare tree and tokens
- [ ] Hosted-Penpot probe (needs the owner's account)

### 1. Core
- [x] Neutrality test (in place from the first commit)
- [x] Connection and endpoint resolution (shell, env file, agent configuration), with redaction
- [x] `probe` (CLI `penpair probe`; checked live against the local Penpot, same result as Sourcer's baseline)
- [x] `doctor` (docker, secrets file, containers, frontend, backend ready, editor and plugin connected; notices an MCP key that belongs to another instance)
- [x] Safe write runner (`runOperation`: inspect, one write only with `--apply`, settle, independent readback, verify; opens the right page itself)
- [x] Built-in operations and CLI: `pages`, `tree`, `audit` (blank text, unbound colours, overflow, spacing steps, ignore list), `tokens dump` and `tokens diff` (effective values per theme), `archive`, `export` (waits for two identical exports), switch page
- [x] A registry projects add their own snippets to (`defineSnippet`; listed under `snippets` in `penpair.config.json`; parameters with types and defaults; read and write kinds; `penpair snippets`, `snippets check` without a connection, `penpair run <name> --param k=v [--apply]`); the built-in operations are registered the same way
- [ ] Token-set write operations (add, promote, remove) as built-in snippets
- [x] Instance lifecycle: `init`, `up`, `down`, `status`, `backup`, `backup verify`, `restore`; secrets in a 0600 `.env`; unique ports, compose project and volumes per instance (`penpair.config.json`, optional `composeProject` to adopt an existing instance's volumes). Live-tested on a scratch instance: up in about ten seconds, backup, verify (caught a stray asset file), restore (removed what was added after the backup, kept what was in it), down with volumes kept.
- [x] Unit tests with a fake tool client (suspended-tab retry, size guard, redaction, probe)
- [ ] A fake MCP server over HTTP for the connect path, and an automated live smoke test

### 2. Tradient adopts it
- [x] Trial instance on its own port 9002 with separate volumes, in a throwaway folder (`.local/tradient-trial`, compose project `penpair-tradient-trial`): clean `init` and `up` took 16 seconds with the images cached. Not yet in Tradient's repository (needs the owner's go).
- [ ] `doctor` green on a fresh clone in under ten minutes
- [ ] Marwes tokens imported through the adapter
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
- [ ] A short illustrated version (screenshots of each browser step)

### 4. Publish
- [x] Skills pack shipped in the package (`packages/core/skills`: `penpot-design` with the write protocol, the plugin traps including the hosted-Penpot findings, flat auto-layout, a library-in-Penpot note and a `project-facts.md` template the project owns; `design-judgment` with the recipes made project-neutral) and `penpair skills install` (copies, links for Codex and Claude Code, prints the AGENTS.md rows, keeps edited files, never replaces `project-facts.md`). The neutrality test covers the skills too.
- [ ] Guide with screenshots, the hosted-profile run on a large file
- [ ] First outside trial with feedback rounds (like Reflection's)
- [ ] 0.1.0 published (owner): create the `@penpair` npm org and the GitHub repo, push, run the steps in `docs/releasing.md`

## Extension points
Connection profile, library adapter, snippet registry, verification provider, skill pack. See `docs/guide.md`.

## Decided
- Packages (owner, 2026-10-20): `@penpair/core` (library, command, skills, both variants) and `penpair` (the short name; depends on core at the same version). Later: `@penpair/docker` (the Docker profile, split out when a second profile appears or the Docker code grows), `@penpair/marwes` (the Marwes adapter, incubated here; may move to the Marwes repository). The npm organisation `@penpair` is created by the owner.
- Default path is the external profile (hosted or team-run Penpot); Docker is an alternative, kept and tested but not the priority (owner, 2026-10-20). Consequences: the guide leads with `init --external`; `penpair setup` asks "web or this computer?" and defaults to web; the `.penpot` round trip is first tested against the hosted Penpot with `sourcer-base`.
- Licence: MIT, same as Reflection. Published by the owner, when the owner decides; `packages/core/package.json` stays `private: true` until then.

## Undecided
- Whether the design-judgment skill pack lives here or in its own repository
- Whether the Marwes adapter moves into the Marwes repository once stable
- Whether Sourcer's page-verify gate ships as a product or stays a documented pattern
- Backup destination and who owns the master `.penpot` file

## Change log
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
