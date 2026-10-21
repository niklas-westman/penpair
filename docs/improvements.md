# penpair: living improvement checklist

Versioned delivery plan and reports for `codex/penpair-improvements`. Kept in sync with the owner's design brief.

Written 2026-10-21 after the first real use of penpair 0.1.3 in Tradient (hosted Penpot, `@marwes-ui/react` 1.11.0, a full Dashboard page built and pushed). Audience: Codex (or any coding agent) working in the penpair repository during the day. Everything marked **Observed** happened in that session; everything marked **Idea** is a proposal.

Repository: this checkout (GitHub `niklas-westman/penpair`, branch `main`, MIT).

> **Codex research update — 2026-10-21.** Reviewed against penpair commit `c38f832` (0.1.3), the local source and tests, and current primary documentation. Claude's session observations below are retained as reported evidence; Codex did not repeat that live session. Section **I** adds 12 improvements, section **3** is the authoritative prioritized checklist, and sections **6–8** explain corrections, sources, and research limits. The research baseline left every delivery box unchecked; the Delivery status and Completion reports below track subsequent implementation.

## Delivery status

Last updated: **2026-10-21**. Completed: **4 / 40**. In progress: **none**. Blocked: **none recorded**.

**Now: G1 — transport fault tests and scratch smoke harness** Queued. Work remains on `codex/penpair-improvements` for review before merging.

Use [the prioritized checkboxes](#3-prioritized-delivery-checklist--codex-revision) to track delivery. The proposal sections hold scope and acceptance criteria; [section 6](#6-assessment-of-claudes-brief-and-corrections-to-its-proposals) corrects the original proposals. Record finished work under [Completion reports](#completion-reports).

### Working agreement — one item at a time

1. Read this status and the selected item's proposal, acceptance criteria and corrections before starting. Keep exactly one **Now** item; mark it in progress here when implementation begins. Preserve the other items and their order unless evidence or the owner changes priorities.
2. Implement and verify that item. Record partial work or blockers beside its checkbox, leaving it unchecked. If an item needs smaller steps, add child checkboxes under it; only the 40 top-level IDs count toward progress. Check the parent only when its full acceptance criteria pass.
3. On completion, change its top-level `[ ]` to `[x]`, add a dated link to its completion report on the same line, and update this status in the same change. Update the corresponding repository `PLAN.md` entry/change log and relevant docs, skills or changelog when the implementation requires them.
4. Append a report using the template below and send the user the same concise summary **after every completed item**, before starting the next item. Explain what problem was resolved and its practical effect. Report failures or blocked attempts honestly; they are progress notes, not completions.
5. Advance **Now** to the next eligible unchecked item, recording any skipped dependency or required owner action. Continue only within the work already authorized; a per-item report does not create an extra approval gate. This document update itself does not start the implementation backlog.
6. Preserve earlier reports as history. If a completed item regresses, reopen its checkbox, adjust the count, and append a dated explanation that references the prior report. Record priority/scope changes under Tracker history; do not silently redefine a completed item.

### Per-item summary report

Use this in both the document and the user-facing report. Keep it brief, with enough evidence to support completion.

```markdown
### YYYY-MM-DD — ID: item title

- **Resolved:** The previous failure/friction and the behavior that now replaces it.
- **Changed:** The concrete change and relevant files; commit reference if one exists.
- **Validated:** Exact commands/checks and outcomes; identify the acceptance criteria covered.
- **Risks:** Remaining limitations and checks not run. State any required follow-up.
- **Next:** Next eligible item and whether it is queued, in progress or blocked.
```

A completion report is required for each checked top-level ID. For a blocker, add a dated note beneath the affected checkbox with the evidence, missing dependency and next action. Do not mark an item complete while a required acceptance check is outstanding.

## 0. Read this first

**Rules that do not bend** (they are enforced by tests or by the owner):
- Never print, log or commit an MCP key (`userToken`). Keys live in git-ignored `.env.local` files.
- Do not publish to npm and do not run `pnpm release --publish`. The owner publishes. You may prepare a release (`pnpm bump`, CHANGELOG, `pnpm check`) and commit; push only when asked.
- All packages share one version (lockstep, enforced by `scripts/check-versions.mjs`). Never bump one package alone.
- `@penpair/core` knows nothing about Docker, Marwes or any project. `packages/core/test/neutrality.test.ts` and `boundary.test.ts` fail if it does. `@penpair/marwes-ui` may name Marwes but never a project (Tradient, Sourcer).
- Dependencies point one way: `@penpair/web` and `@penpair/docker` depend on `@penpair/core`; the core has no command. Install one command package, never both.
- Every behaviour change needs a test. `pnpm check` (build, typecheck, tests, version check) and `pnpm smoke:package` must pass. Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` is the owner's convention for Claude; for your own commits use your own trailer.
- Do not edit Reflection or the Sourcer and Tradient repositories from here. Tradient is a consumer: propose changes for it in your report.

**Where things are**

| Area | Path |
| --- | --- |
| CLI entry, command routing | `packages/core/src/cli-main.ts` |
| Connection, tool client, retry | `packages/core/src/client.ts`, `endpoint.ts`, `instance/connection.ts` |
| Snippet model and registry | `snippet.ts`, `registry.ts`, `project-snippets.ts`, `snippets/*.ts` |
| Write runner (inspect, apply, readback) | `operation.ts` |
| Baselines and Reflection hand-off | `baselines.ts`, `baselines-config.ts` |
| Skills (shipped to projects) | `packages/core/skills/{penpair-design,penpair-setup,design-judgment}` |
| Skills installer | `packages/core/src/skills.ts` |
| Marwes adapter | `packages/marwes-ui/src/*` (`tokens.ts`, `penpot.ts`, `commands.ts`, `snapshot-file.ts`) |
| Docs | `README.md`, `docs/*.md`, `PLAN.md` (living plan), `CHANGELOG.md` |
| Release tooling | `scripts/*.mjs`, `docs/releasing.md` |

**How to work:** one item per commit where you can; update `PLAN.md` (change log) and `CHANGELOG.md` (under the next version) for anything user-visible; keep docs and skills in step with code.

## 1. State after the Tradient run

What works, verified live on the hosted Penpot (2.18.4):
- `setup`, `connect`, `doctor`, `pages`, `tree`, `audit`, `export`, `tokens dump`, the safe write runner.
- `@penpair/marwes-ui`: 4 sets, 271 tokens from Marwes 1.11.0 plus Tradient's theme; `check` (offline), `diff`, `push --apply` with read-back and structural fingerprint.
- A full page (535 to 540 nodes, flat auto-layout, every fill, stroke, gap and padding token-bound) built from scripts; `penpair audit` clean.
- Tradient committed and pushed the setup (`penpair.config.json`, `design/marwes-tokens.snapshot.json`, skills, AGENTS.md rows) so a colleague can connect to the same Penpot file.

What the run showed is missing is the rest of this document. The headline gaps:
1. **No guard that the connected editor has the right file open.** A colleague with another file open would receive writes meant for the shared one (A1).
2. **Building a page needed a hand-made runner and a hand-made helper kit** that does not exist in penpair (B1, B2).
3. **Marwes components are not covered, only tokens**, so component drift is invisible and every page re-measures Marwes by hand (C1).
4. **Design to code is a manual step.** There is no spec an agent can implement from (D1).
5. **Team use is undocumented and unguarded** (A1, A2, A3).

## 2. Index

Priority, revised by Codex: **P0** confirmed safety/correctness gaps to close before expanding writes; **P1** next dependable workflow; **P2** later product expansion or polish. Effort: S under half a day, M about a day, L several days; these are rough sizing assumptions, not delivery promises. The detailed original proposals retain their original ratings for traceability; this index and section 3 override those ratings. Large items must be split before implementation.

| ID | Title | P | Effort |
| --- | --- | --- | --- |
| A1 | Guard: the connected file must be the project's file | P0 | M |
| A2 | Retry after a suspended tab can run a write twice | P0 | L |
| A3 | Team onboarding and an advisory write lock | P1 | L |
| A4 | Key handling: keychain and file reference | P2 | M |
| B1 | `penpair run-file`: run a script file with the same safety | P1 | M |
| B2 | A build kit: token-bound helpers for building pages | P1 | L |
| B3 | Export and tree by name; a `shots` command | P1 | S |
| B4 | Settle detection instead of fixed waits | P1 | M |
| B5 | Fold this session's Penpot quirks into the skill and the kit | P1 | S |
| C1 | Marwes components: measure, snapshot, build, diff | P2 | L |
| C2 | Token-set write operations and project extra sets | P1 | M |
| C3 | Resolved-value drift per theme, dark mode check | P1 | M |
| C4 | Theme lint: gaps in the project's theme | P2 | S |
| D1 | `penpair spec`: a design description an agent can implement | P2 | L |
| D2 | Approvals as a record | P2 | M |
| D3 | Structure snapshots and a design diff for pull requests | P2 | L |
| D4 | `@penpair/reflection-check` and baselines for Tradient | P2 | M |
| E1 | `penpair mcp`: penpair as an MCP server | P2 | L |
| E2 | `skills install` edits AGENTS.md itself | P1 | S |
| E3 | New skills: `penpair-recipes`, `penpair-handoff` | P2 | M |
| F1 | Docs: restructure, team guide, troubleshooting, cookbook | P2 | M |
| F2 | `penpair status` for web projects, `penpair open` | P2 | S |
| F3 | Audit rules: contrast, coverage, targets, names | P2 | M |
| G1 | Tests: fake MCP server, nightly live smoke | P1 | M |
| G2 | Release: plan printout, provenance from CI | P2 | M |
| G3 | Backup of a hosted file | P1 | M |
| H1 | Tradient follow-ups (outside this repo) | P1 | S |
| H2 | Upstream asks for Marwes | P2 | S |
| I1 | Invalid config must stop guarded commands | P0 | S |
| I2 | Verification needs explicit positive evidence | P0 | M |
| I3 | Recoverable operations and checkpoints | P1 | L |
| I4 | Capability-driven native API support | P1 | M |
| I5 | Artifact identity, consistent capture and atomic output | P1 | M |
| I6 | Token ownership and conflict-aware reconciliation | P1 | M |
| I7 | A stable machine-readable command contract | P1 | M |
| I8 | Structured inspection and large-file budgets | P1 | M |
| I9 | State, theme and responsive coverage | P1 | M |
| I10 | Versioned schemas and token interoperability | P2 | M |
| I11 | Explicit trust boundaries for executable extensions | P1 | M |
| I12 | Measured first-run and collaboration trials | P1 | M |

---

## A. Safety and teamwork

### A1. Guard: the connected file must be the project's file (P0, S)

**Observed.** `doctor` and `connect` print the file name from `penpot.currentFile.name` (`cli-main.ts` lines near 160 and 193), but no code compares it with anything. The endpoint guard (`instance/connection.ts`) only checks the Penpot origin. In a team the key belongs to a person, not a file: whichever file that person has open with the plugin connected receives every command. A colleague who has a scratch file open would get `marwes tokens push --apply` or a page build written into it.

**Proposal.**
- Add an optional `file` block to `penpair.config.json`: `{ "file": { "id": "...", "name": "tradient-project" } }`. `penpair connect` and `setup` offer to record it after the first successful connection (id from `penpot.currentFile.id`).
- Every command that writes (everything with `--apply`, `marwes … push`, `baselines --apply`, `run`) and `doctor` reads `currentFile.id` first and refuses when it differs, naming both files and how to fix it ("open <name> and reconnect"). Read commands warn instead of refusing. `--any-file` overrides (parallel to `--any-instance`).
- The core stays neutral: this lives in `instance/connection.ts` beside the origin guard.

**Acceptance.** Unit tests with the fake client: same file passes; different id refuses writes and warns on reads; no `file` block keeps today's behaviour; `--any-file` overrides. `doctor --json` includes `file: { expected, actual, ok }`. README and `docs/getting-started.md` describe it. Tradient's `project-facts.md` template tells the owner to record the id.

**Touches.** `instance/config.ts`, `instance/connection.ts`, `cli-main.ts`, `instance/connect.ts`, `doctor`, docs, skill `penpair-setup`.

### A2. Retry after a suspended tab can run a write twice (P0, M)

**Observed.** `executeCode` (`client.ts`) retries up to 6 times when the tab is suspended, re-sending the same code, with the comment that the snippet may already have run. During the Tradient build the log printed "Penpot tab is suspended (retry 1/6, 2/6)" and the script ran again. The built-in write snippets are idempotent by contract (`operation.ts`), but a project snippet or a raw script is not required to be, and a duplicate board is easy to create.

**Proposal.**
- Give each execution a run id and wrap the code so that, as its first step, it checks `penpot.currentFile` plugin data (or a hidden shape name on the root) for that id and returns `{ ok: true, alreadyRan: true }` without doing the work; it writes the id as its last step. Then a retry is safe by construction.
- Where plugin data is unavailable, fall back to: after a suspended-tab error on a write, do not retry automatically; read the page, report, and ask the caller to inspect (the protocol already says never retry blindly).
- Make the behaviour visible: the result of `run`/`run-file` says `ran`, `alreadyRan` or `uncertain`.

**Acceptance.** Test with a fake client that suspends once after executing: the second delivery returns `alreadyRan` and the page has one board. Documented in `penpair-design/references/write-protocol.md`.

### A3. Team onboarding and an advisory write lock (P1, M)

**Observed.** The owner asked how a colleague can work on the same design. The honest answer is a manual four-step list. Nothing prevents two people (or two agents) running builds against the same file at once, and nothing tells a human that a script is running.

**Proposal.**
- `penpair onboard` prints (and `--json` returns) the colleague checklist for this project from the config: install, create own MCP key at the Penpot URL, `penpair connect`, open file `<name>`, Connect, `doctor`. It links the file via A1 and, if `file.id` is known, prints the file URL.
- Advisory lock: before a write, the runner sets a marker (plugin data on the file: who, what, when) and clears it after; a second writer sees it and stops with "X is running <operation> since <time>; use --force-lock after checking". Locks expire after a short time. Reads ignore it. This is advisory: humans editing in Penpot are not blocked (Penpot has live collaboration), only penpair writers.
- Record `revn` at inspect and refuse the apply if the file changed in between (the write protocol already describes "pin"; check it is implemented for all built-in writes and add it to `run-file`).

**Acceptance.** Tests for lock acquire, conflict, expiry and `--force-lock`. `docs/team.md` (see F1).

### A4. Key handling (P2, M)

**Observed.** The key sits as a plain URL in `.env.local` (0600, git-ignored, checked by `doctor`). The URL contains the key as a query parameter, so it is easy to leak through shell history, process lists or logs.

**Proposal.**
- Support `PENPAIR_MCP_URL_FILE` (a path outside the repo) and a command form `PENPAIR_MCP_URL_COMMAND` (for example `op read ...` or macOS `security find-generic-password -w`), resolved only at connection time and never printed.
- `doctor` warns when the key file is group- or world-readable and when `.env.local` is tracked or appears in git history (`git log --all -- .env.local`).
- Add a "rotate a key" section to `docs/getting-started.md` and the setup skill.

**Acceptance.** Tests in `endpoint.test.ts` for both forms and for redaction of everything they return.

---

## B. Building pages: the loop we had to improvise

**Observed.** There is no way to send a script file to Penpot with penpair's safety. To build the Dashboard I wrote a throwaway runner (`briefs/reference-dashboard-build/pp.mjs`: wraps a script with `wrap`, resolves the endpoint, `connect`, `executeCode`) and a throwaway helper prelude (`box`, `text`, `icon`, `card`, `progress`, `segmented`, `inst`, `flush`). Both worked well and both belong in the product.

### B1. `penpair run-file` (P1, S)

**Proposal.** `penpair run-file <script.js> [--param k=v] [--apply]` (and `penpair run <registered-name>` already exists). The script body is plugin code (like a snippet body) and may be several files concatenated (`--include helpers.js`). It reuses `wrap`, `requirePage`, the 90 KB guard, the file guard (A1), the run id (A2) and prints the JSON result. Without `--apply` it must not write: the simplest honest rule is to require scripts to declare themselves read-only via a header comment `// penpair: read` and otherwise to demand `--apply`; refuse to run an undeclared script without `--apply`.

**Acceptance.** Test: read script runs without `--apply`; write script refuses; size guard; `--include` order. Document in `docs/guide.md` and the `penpair-design` skill command table.

### B2. A build kit (P1, L)

**Observed.** Every helper needed was small, but writing them cost the session its first hour. These are the ones that proved necessary (all token-bound; the working originals are in `briefs/reference-dashboard-build/` next to this file: `prelude*.js` hold the helpers, `pp.mjs` the runner, `c1-top.js` to `c3-bottom.js` the page; read its README first):
- `tok(name)`, `bind(shape, token, props)`: look a token up across active sets (later set wins) and bind it. Binding must happen **after** values are set (setting `flex.rowGap` unbinds `rowGap`) and the call is recorded asynchronously.
- `box(parent, {dir, gap, pad, align, justify, w, h, bg, stroke, radius, clip})`: a flex board; styles are applied in a second pass after a wait (`style()` + `flush()`).
- `text(parent, str, {typo, color, wrap, grow})`: text with a typography token, a colour token and the right font face via `font.applyToText(text, variant)`.
- `icon(parent, kind, colorToken, size)`: a square wrapper board with a path scaled evenly (a bare path resized to a square distorts non-square glyphs).
- `inst(parent, path, name, {textName: value})`: instantiate a library component and override named texts.
- `rule`, `dot`, `card` (the Marwes card recipe), `progress`, `segmented`, `iconTile`.
- `fill(shape)`/`fillV(shape)` for `layoutChild` sizing.

**Proposal.**
- Ship the kit as plain JavaScript source text in the core (`packages/core/kit/*.js`) because it runs inside Penpot's plugin sandbox and must be concatenated into the snippet (`penpair run-file --include @kit`). Export the source strings from `@penpair/core` (`kit()`), with a size budget well below 90 KB.
- Keep it neutral (no Marwes names). Marwes-specific recipes (`card`, `segmented`, `iconTile`, `progress`, the stat tile) belong in `@penpair/marwes-ui` as a second include (`@marwes-kit`), parameterised by token names so a project can retarget them.
- A `defineRecipe` convention: a recipe is `(parent, props) => shape` with a name, and `penpair recipes` lists them. Pages in a project become short scripts that call recipes.
- Provide `penpair kit check`: compiles the kit with `compiles()` from `snippet.ts` so an edit cannot break it silently (the probe had exactly that regression once).

**Acceptance.** Unit tests compile every kit file and run them against the existing fake plugin objects extended with `createBoard`/`createText` fakes enough to check call order (binding after values). A documented, tested example page (a small "Hello, card" page) that the live probe can build and remove on a scratch file (`probe --deep` extension).

### B3. Export and tree by name; a `shots` command (P1, S)

**Observed.** `penpair export` needs a shape id, and ids change on every rebuild, so each iteration needed an extra script to find the id (`id.js`). The `tree` option is `--prefix`, which is easy to mistype as `--namePrefix` (the CLI then fails with a generic parseArgs error).

**Proposal.**
- `penpair export --name "Dashboard / Desktop" --page Dashboard out.png` (exact name, error on zero or several matches, list them).
- `penpair shots --page Dashboard [--prefix "Dashboard /"] [--out design/shots]` exports every top-level frame at stable render. (Baselines does this for configured frames; `shots` is the ad-hoc version.)
- A clearer error for unknown options: print the nearest known option.

**Acceptance.** Tests against the fake client; docs updated.

### B4. Settle detection instead of fixed waits (P1, M)

**Observed.** The build used fixed sleeps (1.2 s before styling, 2.5 s after, longer for components) and layout still needed 10 to 30 s to settle before exports were right; early exports showed overlapping text. The skill says "poll geometry", but there is no helper.

**Proposal.** A kit function `settle(shape, {timeout})` that polls the bounding boxes of a subtree until two consecutive reads are identical, and the same primitive inside `exportShapePng` (it already waits for two identical exports; add an optional geometry check). `runOperation`'s "settle" step should use it.

**Acceptance.** Test with a fake shape whose size changes for N reads; timeout produces a clear "did not settle" result, not a silent pass.

### B5. Fold this session's Penpot quirks into the skill and the kit (P1, S)

All **Observed** on Penpot 2.18.4 (hosted). Add to `packages/core/skills/penpair-design/references/penpot-plugin-gotchas.md` and `docs/compatibility.md`, and make the kit avoid each one:

1. A flex row with `alignItems: "stretch"` inside a hugging parent computes height 0 and its children overlap. Use `start` and give blank or fill children an explicit height.
2. A hugging parent that gets a child with `layoutChild.verticalSizing = "fill"` silently becomes `fix`. Re-set `flex.verticalSizing = "auto"` on the parent after the build.
3. `board.resize(w, h)` is needed to set a height; setting `flex.verticalSizing = "fix"` alone leaves the 100 px default.
4. `text.characters = ""` is rejected (`Value not valid: . Code: :characters`). A blank text needs a non-breaking space (or design the component without the text).
5. `shape.fillOpacity` is not assignable (`object is not extensible`); use `shape.opacity`, or set it through the `fills` array (and note a token binding on `fill` resets it).
6. Token formulas work in `addToken`: `{mw-ui-radius}*2` resolves to 8 (`resolvedValue`), and a token set can be added to existing themes with `theme.addSet(set)`.
7. Children of a component instance cannot be removed or reordered; only text, fill and token overrides work. Design components so each variant needs only text overrides, or make one component per structural variant.
8. Flex properties are named `topPadding`, `rightPadding`, `bottomPadding`, `leftPadding`, `rowGap`, `columnGap`, `horizontalSizing`, `verticalSizing`, while the token binding keys are `paddingTop` and so on; do not mix them.
9. `penpot.createComponent` is `penpot.library.local.createComponent([board])`; the name `"Group / Part"` becomes path `"Group"` and name `"Part"`; bindings must be saved (wait a few seconds) before the component is created.
10. `penpot.fonts.findByName("Instrument Sans")` found a Google font on the hosted Penpot, and `font.applyToText(text, variant)` with the variant for the weight made the exporter draw the right face.
11. A path's size is its bounding box; resizing it to a square stretches non-square glyphs. Wrap it in a fixed-size board and scale evenly.
12. After a build, `penpair tree` and `export` can show an unsettled layout for 10 to 30 s. Do not judge a frame before it is stable.
13. The editor tab goes to sleep when not visible (a heartbeat gap of 6 to 8 minutes was enough). Commands then fail with the suspended-tab message and retry (see A2). Keep the Penpot tab visible; a separate window works better than a background tab. Document that and add it to `doctor`'s hint.

**Acceptance.** The gotchas file has a dated section for each; `skills.test.ts` still passes; the neutrality test still passes (no project names).

---

## C. The Marwes adapter

### C1. Marwes components: measure, snapshot, build, diff (P1, L)

**Observed.** The adapter covers tokens and keeps them from drifting, but a Marwes bump can change a component's anatomy (padding, radius, type size, border) without changing one token, and Penpot would not notice. To build the Dashboard I measured real Marwes components by hand: bundle a small React page with `esbuild` (CSS loader on, fonts as data URLs), render it with the project's theme in a headless browser (Playwright was found in a sibling repository), and read computed styles. Findings that no token carries (**Observed** at 1.11.0 with the Tradient theme): StatTile padding 24, gap 8, radius 24, value 28/600 (no typography token), label 12/500, trend 12/500; Card padding 24, radius 8, 1 px inset border at 15 % black; Badge 2/8 padding, radius 4, 12/500, 1 px inset border; Button 40 high, padding 12/16, radius 4, label 14/500; NavigationTabs tab 8/16 padding with a 2 px underline in `mw-color-border-brand`; ProgressBar track 8 px, radius 999, fill primary; Avatar 40 px, radius 9999, 1 px border.

**Proposal** (all in `@penpair/marwes-ui`, under `penpair marwes components …`):
1. `components snapshot [--write]`: renders a fixed catalogue of components and variants (StatTile tones, Badge variants, Button variants, Card, Tabs, Banner, ProgressBar, Avatar, Divider, SegmentedControl, Select, Icon) with the project's theme in light and dark, and writes `design/marwes-components.snapshot.json` (per component and variant: box size, padding, gap, radius, border, background, text styles as **token names where they match** and raw values where they do not). It needs a browser, so keep Playwright an optional peer dependency and say so plainly when it is missing.
2. `components check`: compares the committed snapshot with a fresh measurement (CI where a browser exists; otherwise only a hash of the Marwes version plus theme file: a changed version with an unchanged snapshot is "stale").
3. `components build [--apply]`: builds or updates the Penpot components (`Marwes / Button / Primary` etc.) from the snapshot using the build kit (B2), with token bindings, so a project starts with a complete, correct library instead of hand-built parts. Idempotent; reports which components changed.
4. `components diff`: Penpot component anatomy against the snapshot (padding, radius, token bindings), and how many instances are in use.
5. Record in the snapshot the facts no token carries, and let `tokens` own them: see C2.

**Acceptance.** The catalogue and the measurement script are tested with a stub renderer (a function returning computed styles) so CI needs no browser; one end-to-end test behind an environment flag. Documented in `docs/marwes-tokens.md` (rename or split into `docs/marwes.md`).

**Risk.** Marwes may change class names. Select by role and component name from the React tree rather than by CSS class where possible.

### C2. Token-set write operations and project extra sets (P1, M)

**Observed.** `PLAN.md` still lists "token-set write operations" as open. I created `Tradient · Page` by hand (three radius tokens: card, tile, pill, made from `mw-ui-radius` by formula) because Marwes components have radii that are not tokens. `push` and `diff` ignore that set (it is not in the snapshot), so it can drift invisibly, and a colleague cannot recreate it.

**Proposal.**
- Core: built-in write operations `tokens add-set`, `tokens set`, `tokens remove`, `tokens promote` (a set's tokens into another), each with inspect, apply, readback.
- Adapter: a `marwes.extras` config block (or a file `design/tokens/<set>.json`) that declares project-owned sets and tokens (with formulas), included in the snapshot as managed sets so `check`, `diff` and `push` cover them and put them last in both themes. For Tradient this is exactly `Tradient · Page`.
- Make the three Marwes component constants first-class: the adapter should generate them (derived from the measurement in C1) rather than the project typing them.

**Acceptance.** Snapshot schema version bump with a migration note; tests with the simulated Penpot; `docs/marwes-tokens.md` updated.

### C3. Resolved-value drift per theme, dark mode check (P1, M)

**Observed.** `diff` compares token values and theme membership. It does not read what a token **resolves to** under each theme, so a wrong set order or an inactive set would pass. The Dashboard was only looked at in Light; Dark was never checked.

**Proposal.** `diff --resolved`: activate each theme in turn (restoring the user's choice, the same care `push` takes), read `resolvedValue` for every token, compare with the expectation computed from Marwes for that theme, and restore. Add `penpair marwes tokens verify-modes`: shows the same frame exported in Light and Dark (needs the theme switch and the export, so it is a write-adjacent operation with the same guards).

**Acceptance.** Simulated Penpot extended with `resolvedValue`; tests for set-order mistakes.

### C4. Theme lint: gaps in the project's theme (P2, S)

**Observed.** Tradient's theme turns primary green but leaves `mw-color-border-brand` blue (`#2F31FC`), so the selected tab underline and links are blue in a green product. Nothing reports this.

**Proposal.** `penpair marwes theme lint`: lists tokens that keep the Marwes default while their siblings are overridden (same family: `primary`, `border-brand`, `text-link`, `text-brand`, `focus`, `surface-brand`, `secondary-*`), as warnings with the hue distance. Heuristic, never an error.

**Acceptance.** Test on a fixture theme with a green primary and a default `border-brand`.

---

## D. From design to code and back

### D1. `penpair spec`: a design description an agent can implement (P1, L)

**Observed.** The loop "Penpot is the authority, the code adapts" has no command for the hand-over. An agent would have to read `tree` output and guess how nodes map to components.

**Proposal.** `penpair spec --page Dashboard --frame "Dashboard / Desktop" [--out design/specs/dashboard.md]` writes a derived, committed document: per region (named boards), the layout (direction, gap token, padding tokens, sizing), each child as either a library component instance (`Marwes / Stat Tile / Success` with its overridden texts) or a primitive with its token bindings, text content, sizes, and the page's states. A mapping file `design/component-map.json` (library component name, code component, prop mapping such as `Stat Tile / Success → <StatTile tone="success" label trendValue value subtitle />`) turns it into near-JSX hints. The adapter ships the Marwes mapping.
- Mark generated files with a header and a hash of the frame so staleness is detectable (`spec check`, offline against the last export manifest).

**Acceptance.** Golden-file tests from a recorded tree JSON (no Penpot). Documented in the new `penpair-handoff` skill (E3).

### D2. Approvals as a record (P2, S)

**Observed.** The skill says "record an approval only on the owner's words" but there is nowhere to put it. Sourcer has a `page accept` gate; penpair has none.

**Proposal.** `penpair approve --page P --frame F --note "<owner's words>"` appends to `design/approvals.json` (frame id, name, revn, export hash, note, date) and refuses an empty note; it never approves on its own. `baselines --update` requires a matching approval newer than the frame's last change (or `--force` with a reason).

**Acceptance.** Tests; docs; the skill text points to the command.

### D3. Structure snapshots and a design diff for pull requests (P2, L)

**Observed.** A Penpot file is the one place the design lives; git sees none of it. Reviews of design changes in a pull request are impossible, and a hosted file has no backup (G3).

**Proposal.** `penpair snapshot --write` exports a stable, diffable JSON of the structure (frames, components, tokens, bindings, texts) per page to `design/snapshots/`; `penpair snapshot diff <base>` prints a readable Markdown change list (frames added or removed, nodes whose token bindings changed, text changes) that CI can post. Not a full-fidelity backup; it is a review and safety aid.

**Acceptance.** Determinism test (two runs identical); size budget (page splitting).

### D4. `@penpair/reflection-check` and baselines for Tradient (P1, M)

**Observed.** `penpair baselines` works and was run end to end with Reflection 0.7.0 on a scratch file. Tradient has no `baselines` block and no coded Dashboard page yet, so Reflection is not used.

**Proposal.**
- Create the package planned in `PLAN.md`: `@penpair/reflection-check`, an adapter that wires `baselines` into Reflection's `reflection-check` and prints a verdict summary, keeping the rule that the pixel percentage is evidence, not a verdict.
- With the owner's approval of the Dashboard frame, write Tradient's `baselines` block (page `Dashboard`, frame `Dashboard / Desktop`, a route) and export the first image. (Outside this repo; see H1.)
- Teach the baselines command to add a second viewport per frame for responsive pages later.

**Acceptance.** An end-to-end test with a stub Reflection; docs in the README Reflection section.

---

## E. Agents

### E1. `penpair mcp`: penpair as an MCP server (P1, L)

**Observed.** An agent that shells out to `penpair` works, but it also inherits the global MCP configuration problem: `doctor` found the owner's global Sourcer key (localhost:9001) and refused it, correctly. The agent's own `mcp__penpot__*` tools in the same session point at Sourcer's Penpot; one wrong tool call would write to the wrong project.

**Proposal.** `penpair mcp` runs a stdio MCP server exposing the safe commands as typed tools: `pages`, `tree`, `audit`, `export`, `tokens_dump`, `marwes_tokens_diff`, `baselines_status`, and gated writes (`marwes_tokens_push` with `apply: false` by default, `run` for registered snippets). Each tool resolves the project from its working directory, enforces the endpoint and file guards (A1), and returns small, structured results. A project registers it in its own `.mcp.json`, which makes "the Penpot for this repo" a property of the repo instead of a global setting.

**Acceptance.** Tests with an in-memory MCP client; `docs/guide.md` shows the `.mcp.json` entry for Claude Code and Codex.

### E2. `skills install` edits AGENTS.md itself (P1, S)

**Observed.** The owner asked "it does not add this itself?" after `setup`/`connect`/`skills install` printed "Add to your AGENTS.md skills table" rows. Also `connect` printed rows pointing at `.skills/…` in a project whose skills live in `.claude/skills` (fixed in 0.1.3 by reusing the existing folder; the printed rows must follow the same folder).

**Proposal.** `skills install --agents AGENTS.md` (default: write to `AGENTS.md` or `CLAUDE.md` if present, otherwise print) inserts or updates the rows between markers `<!-- penpair:skills:start -->` and `<!-- penpair:skills:end -->`, creating the markers at the end of a skills table or a new section. Never touches text outside the markers. `--dry-run` prints the diff.

**Acceptance.** Tests: no file, a file without a table, a file with markers, a second run is a no-op. Setup calls it.

### E3. New skills: `penpair-recipes`, `penpair-handoff` (P1, M)

Write them following `~/.claude/skills/writing-for-agents` (context pointers with front-loaded leading words, one trigger per branch, steps with checkable completion criteria, disclose reference behind pointers, no negations where a positive target exists).
- `penpair-recipes`: building a page. Order: tokens (adapter), components (C1), page (recipes). Binding after values, settle before judging, idempotent scripts, the quirks in B5, naming (`Page / State / Device`), what to check (`audit`, export, look twice).
- `penpair-handoff`: from frame to code. `penpair spec`, the component map, baselines, approvals, Reflection, and what to report ("changed, validated, risks").
- Update `penpair-design` description and body for new commands (run-file, export by name, shots) and the file guard; keep the information hierarchy flat and the SKILL.md short.

**Acceptance.** `skills.test.ts` lists them; neutrality test passes; the README skills table is regenerated.

---

## F. Presentation and docs

### F1. Restructure the docs (P1, M)

**Observed.** The README is 258 lines and carries the pitch, the quick start, web versus Docker, Marwes, Reflection and the AI path in one file. `docs/` mixes reference and walkthrough. There is no team guide, no troubleshooting page, and the guide has still not been followed on a clean machine (`PLAN.md` open items).

**Proposal.**
- README: pitch, a 6-line quick start, a "choose your path" table (person, agent, team), links. Move the long sections out.
- New: `docs/team.md` (several people, one file: keys, file guard, lock, onboarding, what lives in Penpot versus git), `docs/troubleshooting.md` (every `PenpairError` code with cause and fix, generated from `errors.ts` so it cannot drift; add a test that every code has an entry), `docs/cookbook.md` (recipes: add a page, bump Marwes, onboard a colleague, rotate a key, move to another Penpot, restore from a snapshot), `docs/design-workflow.md` (the page lifecycle: prototype, Penpot, approve, baselines, code, check).
- `docs/marwes-tokens.md` becomes `docs/marwes.md` and covers components once C1 exists.
- Add a short illustrated version of the guide (screenshots of each browser step) as already planned.
- A docs map at the top of `docs/guide.md`.

**Acceptance.** All internal links checked by a test (a small link checker over `README.md` and `docs/*.md`); `PLAN.md` open items updated.

### F2. `penpair status` for web projects, `penpair open` (P2, S)

**Observed.** `status` is Docker-only. A web project has no one-screen answer to "is everything fine?".

**Proposal.** `penpair status` for any profile: Penpot reachable, key present and for this Penpot, connected file versus `file` (A1), pages, token snapshot state (adapters contribute a line), baselines state, skills installed and current. `penpair open` opens the Penpot file URL in the browser (needs the file id from A1).

**Acceptance.** Tests; adapters can add status lines through `defineAdapter`.

### F3. Audit rules (P2, M)

**Proposal.** Extend `audit` with optional, config-driven rules (all reported, none blocking by default):
- Contrast: for each text, the bound text colour against the nearest bound fill in its ancestors, computed from resolved token values; report below 4.5:1 (3:1 for large text).
- Library coverage: share of nodes that are instances of library components versus hand-drawn; list the largest hand-drawn groups (candidates for components).
- Touch targets: interactive-looking boards smaller than 24 px (floor) or 44 px (preference).
- Names: frames not matching `<Page> / <State> / <Device>`; layers named `Board`, `Rectangle`, `Group` (default names).
- Blank or placeholder text (the Dashboard audit reported `blankText: 1`, the intentional non-breaking space; allow an `allowBlank` list).

**Acceptance.** Tests on recorded trees; docs.

---

## G. Reliability, release, backup

### G1. Tests (P2, M)
- The planned fake MCP server over HTTP for the connect path and the unfinished "automated live smoke test" in `PLAN.md`.
- A nightly workflow (manual dispatch plus schedule, secrets in repository settings) that runs `probe --deep --write` on a scratch hosted file and `docs/compatibility.md` is updated from the result; it reports a Penpot version drift (API differences) as a failing job, not a surprise.
- Property tests for `normalizeValue` (Penpot returns font families as lists, typography un-normalised, colours upper-cased).

### G2. Release (P2, M)
- `pnpm release --publish` should print the plan (packages, version, what npm has) and require typing the version, as offered earlier.
- Publish from GitHub Actions with npm provenance (`--provenance`, OIDC trusted publishing) behind a protected environment that the owner approves, so the published tarballs are tied to a commit. Keep the local path for emergencies.
- Allow `penpair` (the short name) once npm support answers; then switch README back to `npx penpair` and drop `--except penpair`. (Owner task: email support@npmjs.com.)

### G3. Backup of a hosted file (P1, M)
**Observed.** `currentFile.export("penpot")` fails through the MCP ("No matching clause" on 2.18.3; not retried on 2.18.4), so a hosted file cannot be backed up by penpair. The Dashboard exists only in the owner's Penpot account.

**Proposal.** Document the manual route (File, Export as `.penpot`, store it) in `docs/team.md`; add D3 snapshots as the machine-readable safety net; add a reminder in `doctor` when no snapshot or backup note is newer than N days (configurable, off by default). Re-test `.penpot` export on 2.18.4 and record the result in `docs/compatibility.md`.

---

## H. Outside this repository

### H1. Tradient follow-ups (P1, S) — propose, do not edit Tradient from here

Tradient `main` at `3aa7a1c` has the setup. Recommended next:
1. `package.json` scripts: `design:doctor` (`penpair doctor`), `design:tokens:check` (`penpair marwes tokens check`).
2. CI: run `penpair marwes tokens check` (needs no Penpot, no key). Fails when Marwes or `theme.ts` changes without a new snapshot.
3. `.env.example`: add `PENPAIR_MCP_URL=` with a comment (never a value).
4. Record the Penpot file id in `.claude/skills/penpair-design/references/project-facts.md` (after A1 in `penpair.config.json`).
5. Add a `baselines` block for `Dashboard / Desktop` once the owner approves the frame; run `penpair baselines --apply`.
6. Fix the theme gap from C4 in `src/theme.ts` (`mw-color-border-brand` and related) or document the blue as intentional; re-run `tokens snapshot --write` and `push --apply`.
7. Compare the app at Marwes 1.11.0 against 1.4.1 visually (not done).
8. Implement the Dashboard in `frontend-evolved` from the frame (D1 will make this mechanical); Marwes has no Sidebar component, so decide whether to build `src/components/organisms/sidebar` or ask Marwes (H2).
9. Move the Dashboard build scripts into the repo (`design/snippets/dashboard.mjs`, listed under `snippets`) once B1/B2 exist, so the page can be rebuilt by anyone.

### H2. Upstream asks for Marwes (P2, S)
Facts from the run, phrased as requests:
- Publish the radii of Card (8) and StatTile (24) and the pill radius as theme tokens (today they are component constants, so Penpot needed project tokens).
- A typography token for the StatTile value (28/600/-0.84), or document the scale.
- A `Sidebar`/`SidebarNav` component (the Dashboard needed a sidebar and Marwes has only top `NavigationTabs`).
- A StatTile slot for a sparkline; an optional trend (a blank trend text is rejected by Penpot, and a StatTile without a trend is common).
- Consider a documented measurement fixture (`@marwes-ui/core` could expose component anatomy as data) so C1 does not have to render in a browser.

---

## I. Codex additions from independent research

These are new backlog items. Corrections to Claude's existing proposals are in section 6; implement the corrected contracts, not both versions. Repository locators refer to `c38f832` and are static evidence unless a reproduction is explicitly stated.

### I1. Invalid config must stop guarded commands (P0, S)

**Confirmed in source.** `cli-main.ts:345–353` catches every `loadConfig` failure and proceeds as though this were not a penpair project. A malformed or invalid existing config can therefore skip the instance guard. `adapters.ts:readRawConfig` similarly returns `{}` for malformed JSON. This is distinct from A1's missing file identity.

**Proposal.** Distinguish absent, unreadable, malformed, and schema-invalid config. Existing invalid config stops project commands before connection or dynamic imports. Permit config-free inspection only through an explicit, documented mode. Never silently downgrade a configured project to global endpoint discovery. Return actionable field errors; expose a read-only config validation command and schema.

**Acceptance.** Invalid JSON, wrong profile, invalid fields and unreadable config each fail before any tool call; genuinely absent config follows the documented standalone policy. Exercise core and adapter entry paths.

### I2. Verification needs explicit positive evidence (P0, M)

**Confirmed and reproduced locally.** `registry.ts:136` defaults a missing `readback.problems` to `[]`; `runOperation` converts an empty problems array into `verified: true`. Calling that default verifier with empty inspect/apply/readback objects returns `[]`. Thus a write definition can claim successful verification without supplying evidence. This is a contract gap, not a claim that every existing operation is incorrect.

**Proposal.** Require an explicit verifier or a validated readback evidence schema. Distinguish applied, verified, failed, and uncertain. Verification checks target identity, intended postconditions and protected invariants. Keep semantic verification, structural integrity and visual review as separate results. A successful RPC is not a verified design change.

**Acceptance.** Empty, primitive, malformed and missing readback evidence cannot produce verified success. A failed verifier exits nonzero and preserves recovery information. Cover custom snippets and adapter reports, not only built-ins.

### I3. Recoverable operations and checkpoints (P1, L)

**Confirmed in source.** `marwes-ui/src/penpot.ts:applyPlan` makes multiple batches and stops after an anomaly; completed batches remain applied. There is no durable per-step journal. A2 prevents blind retransmission but does not make a multi-step operation recoverable.

**Proposal.** Persist a redacted operation record containing target IDs, input/plan hashes, preconditions, completed steps and verification evidence. Recompute live state before an explicit resume; reconcile desired state rather than replaying completed steps. Offer a pre-write named version checkpoint when supported and authorized. Treat native version history as a recovery aid and `.penpot` restore testing as the backup proof. Avoid automatic rollback over intervening human edits.

**Acceptance.** Inject failure after every batch boundary, including lost responses; resume produces one intended result or stops on conflict. Checkpoints are linked to the run and no credential enters the journal. Builds remain explicitly non-transactional. Related: A2, A3, G3.

### I4. Capability-driven native API support (P1, M)

**Research finding.** Current official docs list `waitForLayoutUpdate`, `File.validate`, `saveVersion` and code/style generation. Availability on pinned 2.18.3/2.18.4 is unverified. [Penpot API](https://doc.plugins.penpot.app/interfaces/Penpot), [File API](https://doc.plugins.penpot.app/interfaces/File).

**Proposal.** Extend the existing probe with a small versioned capability report. Prefer the native bounded layout wait when supported; retain geometry polling and independent stable exports as fallbacks. Add optional file-integrity validation and recovery checkpoints through detected capabilities. Use generated HTML/CSS only as supplementary evidence for D1. Separate API presence from tested behavior; a mutating capability test runs only on an approved scratch file.

**Acceptance.** Fixtures cover old and new APIs, missing methods and methods that throw. Ordinary doctor/probe stays read-only. Compatibility reports record version, transport, capability and test date. No version bump merely to access a method. Related: B4, G1.

### I5. Artifact identity, consistent capture and atomic output (P1, M)

**Confirmed in source.** `baselines.ts` reads one listing/revision before exporting several frames, writes files incrementally, and writes a manifest even when other configured frames are missing/unstable. A changed, unapproved PNG is preserved, but its manifest receives the current listing's revision. File/page names are recorded without immutable IDs. These can obscure which revision actually produced an approved image.

**Proposal.** Record file/page/frame IDs, captured and approved revision/hash separately, theme, export scale, font/render environment and tool versions. Check identity and content stability around capture; reject or mark a run inconsistent after intervening edits. Stage artifacts and publish the manifest last, atomically where supported; preserve previous provenance for unchanged approval records. Make partial output an explicit mode. Bind D2 approvals to the exact artifact hash rather than a timestamp alone.

**Acceptance.** Edit or switch file mid-capture, fail one export, cancel during output, and rerun without updating a changed baseline: none produces a misleading complete manifest or relabels an old approval as current. Related: D2, D3, D4, I9.

### I6. Token ownership and conflict-aware reconciliation (P1, M)

**Confirmed in source.** `compareToPenpot` judges expected sets and theme membership; `planPush` can overwrite changed managed values. There is no last-successful-sync ancestor distinguishing an upstream update from a designer's deliberate edit. Extra theme membership can be reported even when project-owned sets are legitimate.

**Proposal.** Declare adapter-managed, project-managed and unmanaged sets explicitly. Compare last synced, desired and live states; stop when both live and desired changed the same managed property differently. Require explicit adopt/overwrite decisions. Preserve project extras and report impact before prune or type replacement, including token-reference dependencies across sets. Resolve final values only after applying actual set precedence.

**Acceptance.** Fixtures cover upstream-only, designer-only, conflicting, renamed, cross-set-referenced and project-extra tokens. Prune never deletes an unmanaged token or silently breaks a retained reference. Related: C2, C3, I3.

### I7. A stable machine-readable command contract (P1, M)

**Confirmed in source.** Some commands emit JSON, others prose; `tree` discards the snippet's truncation metadata. The transport currently extracts text blocks, while MCP also supports structured results and output schemas. CLI `export` saves an unstable export and returns success after printing a warning. [MCP tools specification](https://modelcontextprotocol.io/specification/2025-11-25/server/tools).

**Proposal.** Define shared typed command results before E1: schema version, target identity, phase, data, warnings, completeness, timings and structured errors/remedies. `--json` emits one stdout document; progress goes to stderr. Document consistent exit codes, deadlines and interruption handling. Accept validated structured MCP results with legacy-text compatibility. An unconfirmed stable export must be distinguishable by exit code or explicit opt-in.

**Acceptance.** Contract fixtures exercise success, drift, invalid config, suspension, malformed server results and cancellation across core/adapters. Redact at output boundaries. E1 later exposes these same command services rather than duplicating CLI logic.

### I8. Structured inspection and large-file budgets (P1, M)

**Confirmed in source.** `tree` defaults to 400 lines and clips text at 24 characters; `tokensDump` concatenates values into strings, losing composite structure. Audit arrays are sliced to eight examples without total issue counts. These views help people inspect but are insufficient as the canonical input to D1/D3.

**Proposal.** Add ID-addressable structured frame inspection with full text, layout, component provenance, bindings and explicit unknowns. Support bounded depth/fields, total counts and revision-bound pagination or chunking. Scope work to selected frames; invalidate cursors when content changes. Preserve readable tree output. Define request, response and time budgets independently; count final wrapped snippets in UTF-8 bytes.

**Acceptance.** Offline 1k/10k-node fixtures, Unicode text and composite tokens demonstrate bounded output and lossless reassembly. Incomplete results are always marked. Measure call count and payload size before adding caches. Related: B3, D1, D3.

### I9. State, theme and responsive coverage (P1, M)

**Gap.** A correct desktop/light screenshot does not establish responsive behavior, interaction, keyboard access, or empty/loading/error states. Existing baselines already support multiple differently sized frames for one route; do not rebuild that capability.

**Proposal.** Extend baseline metadata with explicit design frame, route, viewport, theme, state, fixture and capture environment. Represent a few approved states first; record unsupported combinations rather than claiming full coverage. Tie implementation checks to these cases and stable fonts/data. Keep contrast/target heuristics advisory; report unknown backgrounds and missing semantics. The browser implementation needs separate interaction and accessibility checks. [Playwright visual comparisons](https://playwright.dev/docs/test-snapshots), [WCAG target-size exceptions](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum).

**Acceptance.** A small matrix includes desktop/mobile, light/dark and one non-happy state. Missing coverage is visible. No inferred clickable board is labeled WCAG-compliant from dimensions alone. Related: C3, D4, F3.

### I10. Versioned schemas and token interoperability (P2, M)

**Gap.** C2 and D1/D3 introduce persistent formats. Without versions and migration rules these will become implicit APIs for projects and adapters.

**Proposal.** Publish versioned JSON Schemas for project config and generated artifacts; preserve unknown adapter blocks and reject unsupported major versions with migration advice. Add a documented DTCG import/export subset with typed values, units and preserved aliases. Keep Penpot arithmetic formulas separate from portable aliases; disclose lossy conversions. Follow published specifications, not preview drafts. [DTCG Format 2025.10](https://www.designtokens.org/TR/2025.10/format/), [published Resolver](https://www.designtokens.org/TR/2025.10/resolver/).

**Acceptance.** Fixtures cover nested aliases, cycles, composite typography, dimensions and supported color spaces, plus migration of an old snapshot. No claim of full conformance until its required behavior is covered. Land schema versions for new formats immediately; broader interoperability can wait.

### I11. Explicit trust boundaries for executable extensions (P1, M)

**Confirmed in source.** Adapters and project snippets are dynamically imported Node modules; theme loading executes a module through Jiti. `runCli` loads configured adapters before routing core commands. These are trusted executable project code, not passive configuration, including during commands described as offline/read-only.

**Proposal.** Document that boundary and lazy-load extensions only when needed. Offer built-in inspection/config validation without executing project modules. Treat B1's read header as a declaration, not a sandbox guarantee; use built-in typed reads for strict read-only access. Resolve script/include paths deliberately and test symlinks. Treat design text and layer names as data when producing Markdown, specs or agent output. For A4, prefer file/OS credential references first; a credential command is an explicit trusted executable with argument arrays, bounded output and a timeout.

**Acceptance.** A fixture with an import-time side effect does not run during built-in help/config validation. Read labels never claim enforced isolation. Exported adversarial layer text cannot become an executable example or an instruction to the agent. Related: B1, A4, E1.

### I12. Measured first-run and collaboration trials (P1, M)

**Gap.** One expert's successful run does not prove onboarding, portability or teamwork. `PLAN.md` already names unfinished human setup trials; this item gives them a measurable outcome.

**Proposal.** Run an owner-authorized trial with a fresh project and a second person: connect, identify the file, inspect, safely create a small scratch design, export, hand off and recover from one failure. Record time to doctor-green, number of interventions, understandable failures, token coverage and verified outcomes. Keep the first scripted build small. Test supported agent skill paths separately. Gather opt-in local evidence, not background telemetry.

**Acceptance.** A reproducible report identifies environment, successful steps, blockers and resulting backlog changes. Two people exercise wrong-file prevention and a simulated writer conflict. Adopt one design-to-code route using existing baselines before approving C1/D1/E1 expansion. Related: E2, F1, G1, H1.

## 3. Prioritized delivery checklist — Codex revision

This replaces the original "order for the day". Order is by risk, dependencies and learning value, not by the number of features shipped. P0 is the first gate. Within later gates, small independent work can proceed alongside prerequisites. Each ID appears once below; check it only after that item's acceptance criteria are met. A partial slice stays unchecked with a progress note. Proposed commands in this document are not installed capabilities.

### Gate 1 — close confirmed safety gaps before expanding writes

- [x] **I1 · P0 · S** — Fail closed on invalid project config. Completed 2026-10-21; [resolution report](#i1-completion-2026-10-21).
- [x] **A1 · P0 · M** — Pin file identity and recheck it inside each mutating execution, including adapters and deep probes. Completed 2026-10-21; [resolution report](#a1-completion-2026-10-21).
- [x] **A2 · P0 · L** — Stop ambiguous write retries; classify idempotency and expose uncertain outcomes. Completed 2026-10-21; [resolution report](#a2-completion-2026-10-21).
- [x] **I2 · P0 · M** — Require positive readback evidence before reporting verified success. Completed 2026-10-21; [resolution report](#i2-completion-2026-10-21).

### Gate 2 — establish recovery and a dependable daily loop

- [ ] **G1 · P1 · M** — Land the HTTP fake server and failure-injection coverage first; keep hosted smoke manual until its editor/session dependency is addressed.
- [ ] **I4 · P1 · M** — Probe capabilities and prefer supported native layout/integrity primitives.
- [ ] **G3 · P1 · M** — Document manual hosted backup now, then prove export/import on scratch with library assets intact.
- [ ] **I3 · P1 · L** — Add operation journal, safe resume and optional recovery checkpoints.
- [ ] **A3 · P1 · L** — Deliver team onboarding and stale-plan detection; investigate advisory coordination without promising atomic exclusion.
- [ ] **I5 · P1 · M** — Preserve artifact provenance and publish consistent capture results safely.
- [ ] **I7 · P1 · M** — Standardize result/error/exit contracts and incomplete-output reporting.
- [ ] **I11 · P1 · M** — Make executable extension trust explicit and avoid unnecessary imports.
- [ ] **B5 · P1 · S** — Publish dated, version-scoped gotchas from the real run.
- [ ] **E2 · P1 · S** — Add idempotent instruction-file integration with explicit destination and preview.
- [ ] **B3 · P1 · S** — Export by unambiguous name/ID and reuse the exporter for ad-hoc shots.
- [ ] **B4 · P1 · M** — Settle with bounded native/fallback checks and independent exports.

### Gate 3 — make one repeatable design-to-code path work

- [ ] **I8 · P1 · M** — Add structured, complete inspection with bounded payloads.
- [ ] **C2 · P1 · M** — Manage project-owned extra sets and safe token CRUD.
- [ ] **I6 · P1 · M** — Add explicit ownership, conflicts and reference-aware destructive plans.
- [ ] **C3 · P1 · M** — Verify actual precedence and resolved values per theme; restore selection reliably.
- [ ] **B1 · P1 · M** — Run reviewed script files through the corrected execution protocol.
- [ ] **B2 · P1 · L** — Ship a small neutral helper slice, then expand from demonstrated recipes.
- [ ] **I9 · P1 · M** — Cover explicit responsive/theme/state cases with deterministic captures.
- [ ] **H1 · P1 · S** — Present the scoped consumer follow-ups for owner authorization; perform no cross-repo edits here.
- [ ] **I12 · P1 · M** — Complete measured human onboarding and collaboration trials; publish findings.

### Gate 4 — expand only where the pilot demonstrates value

- [ ] **C1 · P2 · L** — Pilot measurement and drift on Button/Card/StatTile; gate library generation on preserved instance overrides.
- [ ] **D1 · P2 · L** — Build handoff from structured inspection and explicit component mappings; surface unknown semantics.
- [ ] **D4 · P2 · M** — Extract Reflection integration only after the existing baseline path proves an unmet need.
- [ ] **E1 · P2 · L** — Expose the same guarded command services as typed MCP tools, pinned to an explicit project root.
- [ ] **E3 · P2 · M** — Package proven recipes/handoff practices as focused skills after commands stabilize.
- [ ] **D2 · P2 · M** — Record owner approvals against exact artifact hashes and preserve their provenance.
- [ ] **D3 · P2 · L** — Add deterministic structural snapshots and review diffs atop I8.
- [ ] **I10 · P2 · M** — Add format migrations and a documented portable token subset; version new schemas earlier.
- [ ] **F1 · P2 · M** — Restructure docs from tested user paths; write minimal team/recovery notes in Gate 2.
- [ ] **F2 · P2 · S** — Add web status/open using the shared identity and capability report.
- [ ] **F3 · P2 · M** — Add configurable audits with explicit assumptions, severity and unknowns.
- [ ] **C4 · P2 · S** — Add advisory theme-family lint with suppressions for intentional brand choices.
- [ ] **A4 · P2 · M** — Add credential-file/OS integration; defer command providers until justified.
- [ ] **G2 · P2 · M** — Prepare owner-approved trusted publishing/provenance while keeping lockstep release guards.
- [ ] **H2 · P2 · S** — Present measured upstream Marwes requests; let the owner decide what to send.

## 4. Definition of done (every item)

An item is complete only when all of the following hold:

- Its acceptance criteria and applicable section 6 corrections are satisfied. Any omitted requirement remains explicit unfinished scope, not an implicit waiver.
- Changed behavior is verified with meaningful tests and `pnpm check`. Run `pnpm smoke:package` for package/distribution changes and before a release. Document-only changes need document checks; record checks not run and why.
- Relevant docs, skills and changelog are updated where affected. Repository `PLAN.md` reflects completed implementation in the same change and retains exactly one Now item.
- Neutral core, package boundaries, lockstep versions and secret handling remain intact. Penpot writes follow the inspect/snapshot/write/readback/export protocol and existing owner-approval boundaries.
- The checkbox links to a dated completion report describing **Resolved, Changed, Validated, Risks, Next**. Send that report to the user after the item; update the status count and advance Now.
- Commits occur only when authorized; prefer one verified item per commit. Push, tag, version bump, publish, deployment and non-scratch Penpot writes retain the owner's approval requirements.

## 5. Not verified in this review

- The `.penpot` export and import round trip (still open in `PLAN.md`).
- `penpair setup`'s hidden key prompt on a real terminal by a person.
- Dark mode of the Tradient Dashboard; the app at Marwes 1.11.0 versus 1.4.1.
- `marwes tokens diff` against the hosted file with the published 0.1.3 (the tab was asleep); the local build showed a clean diff before the extra `Tradient · Page` set was added.
- Whether the hosted Penpot's remote MCP exposes `execute_code` for every plan (it did on the free plan, 2.18.4).
- Any claim about Penpot behaviour on versions other than 2.18.3 and 2.18.4.


## 6. Assessment of Claude's brief and corrections to its proposals

**Overall judgment.** Strong field notes and a useful problem inventory. The best ideas are A1/A2, the small helper kit, project token extras, and a reproducible handoff. The brief overestimates how quickly those can become safe product features and gives too many large expansions P1. Its strongest evidence is the observed workflow friction; its weakest part is the safety guarantees attached to proposed mechanisms. Preserve the observations, strengthen the contracts, and stage the product work.

1. **A1: check at the mutation, not only at connection.** The file can change between inspect and apply or between adapter batches. Put the expected ID check inside every delivered mutation. Treat page IDs as identity and names as selectors/labels. Warn prominently for old configs without a file pin, and migrate intentionally. File-sensitive read artifacts should refuse a mismatch rather than quietly generating a spec/baseline for the wrong file. Separate local artifact writes from Penpot document writes. Include `probe --deep --write`, which uses `--write`, not `--apply`.
2. **A2: a final run marker does not guarantee exactly-once execution.** A crash after the first board but before the marker duplicates work on retry; overlapping deliveries create another race. Plugin persistence is not an atomic commit with mutations. First disable automatic retries for ambiguous writes. Then add run IDs, started/completed/uncertain states, stable entity identities and explicit reconciliation. Test partial mutation, lost acknowledgment, restart and overlap. The current retry code supports the risk; Claude's claim that the page build actually duplicated is session evidence, not independently reproduced here.
3. **A3: coordination and revision checks have limits.** A shared plugin-data read then write is not proven atomic; two writers can both believe they acquired it. A local file lock protects only one machine. A revision check detects a stale plan but does not turn a later write into compare-and-swap. Recheck relevant content/IDs immediately before mutation, tolerate known self-writes such as checkpoints, and stop on unexplained change. Defer a stronger cross-machine lock until an atomic service/API is justified.
4. **B1: a read header cannot enforce read-only JavaScript.** Current registered write snippets already have an idempotency contract in `registry.ts`; enforcement and verification are the missing pieces. Reuse its inspect/apply/readback model for reviewed scripts. Avoid implying that a comment, `--apply`, or MCP tool annotation sandboxes arbitrary code. Preserve convenient raw scripting with honest trust and outcome reporting.
5. **B4: research native waits before building a polling subsystem.** `waitForLayoutUpdate` is documented now. Feature-detect and test it; retain the independent export checks because layout completion does not prove font/token/pixel correctness. Two equal exports can both be stale, so pin provenance and verify expected content too. A background hosted tab remains an operational dependency.
6. **C1: computed styles do not establish semantic token bindings.** Several tokens can have the same value; inverse matching must report ambiguity. A browser measurement is one component, theme, viewport and state. Begin with three components and stable, explicit fixture selectors; a React component name is not generally discoverable from the rendered DOM. Use real variants where the pinned API supports them; prove instance text/style overrides survive updates before generating an entire library.
7. **C3: theme order and restoration need distinct checks.** Current source compares membership, not ordered/effective resolution. Do not assume toggling one theme models every active-set context. Snapshot the complete active state, use `finally` restoration, and report restoration failure separately from successful verification. Show per-theme images for human review.
8. **D1/D2/D4: keep inference and authority explicit.** Layout alone cannot make Dashboard implementation mechanical: roles, behavior, data and responsive rules need explicit metadata. A nonempty approval note is useful bookkeeping, not proof of owner authorization. Hash-bind approvals without inventing signatures. Existing `reflectionCases` and tests already support multiple frame sizes for one route; test the present integration before adding a new package. Resizing a frame is not evidence of an independently approved responsive design.
9. **E1/E2: host conventions and instruction ownership matter.** `.mcp.json` is not a universal agent configuration format. Document each supported client's actual configuration during implementation. A long-lived server should receive an explicit project root rather than trusting its startup working directory. Restrict its typed writes through the same service contract. For instruction edits, update only owned markers, expose the resolved path, refuse malformed marker pairs, and do not silently choose between conflicting AGENTS.md/CLAUDE.md instructions.
10. **F3: design lint is advisory evidence.** Contrast needs actual composited backgrounds, opacity and gradients; unknown cases must stay unknown. A text or board name does not establish semantic interactivity. WCAG's 24 CSS pixel target requirement has spacing and other exceptions; a 44 px preference is a separate policy. Component coverage is a maintainability signal, not a quality verdict.
11. **G1/G2/G3: make the operational dependencies explicit.** A scheduled hosted write smoke test still needs an authenticated open editor/plugin; CI secrets alone do not supply that. Begin with deterministic HTTP fault tests and manually authorized scratch smoke runs. Native named versions help recover, but do not replace an independently restored archive. Test `export('penpot', 'all')` as one documented candidate and compare imported assets/bindings/components; the optional argument is not a proven fix for the observed error. npm trusted publishing now generates provenance automatically for supported providers and has specific CLI/runtime requirements; validate those with the existing pnpm release wrapper before changing the publishing path.
12. **Definition of done needs proportionality.** The original all-items wording is a delivery template, not authorization to commit, release, bump versions, or edit consumer repositories. Run behavioral checks for code changes and package smoke for distribution changes/releases. For this research-only update, validate the document and existing baseline, leave delivery boxes unchecked, and leave repository PLAN.md's single Now item intact. Error codes are not all centrally enumerated: `errors.ts` contains `PenpairErrorCode`, while config/lifecycle/registry and adapter errors also need a documentation inventory.

## 7. Sources and evidence trail

Primary sources accessed 2026-10-21. Current documentation may describe APIs newer than the pinned runtime; source publication is not a successful compatibility test.

| Source | What it establishes / how used |
| --- | --- |
| [Penpot plugin API: Penpot](https://doc.plugins.penpot.app/interfaces/Penpot) | Documents native layout wait and markup/style/font helpers. Motivates I4 and a smaller D1 investigation. |
| [Penpot plugin API: File](https://doc.plugins.penpot.app/interfaces/File) | Documents immutable file ID, revision, plugin data, version save/find, integrity validation and archive export with library modes. Motivates I3/I4; does not promise transactions or atomic locks. |
| [Penpot export/import guide](https://help.penpot.app/user-guide/export-import/export-import-files/) | Documents manual file backup and shared-library export choices. Supports an immediate G3 fallback while machine export is investigated. |
| [Penpot MCP execution source/docs](https://github.com/penpot/penpot-mcp/blob/develop/_autodocs/api-reference/ExecuteCodeTool.md) | Upstream execution and error envelope, consulted through Context7 with the handler/task docs. Persistent session storage is not durable exactly-once execution. Develop-branch material is not a version-pinned guarantee. |
| [MCP tools specification, 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/server/tools) | Typed schemas and structured results, plus annotations. Supports I7 and later E1. |
| [MCP maintainers: tool annotations](https://blog.modelcontextprotocol.io/posts/2026-03-16-tool-annotations/) | Annotations are hints rather than enforcement; supports corrections to B1/E1. |
| [DTCG Format 2025.10](https://www.designtokens.org/TR/2025.10/format/) and [published Resolver](https://www.designtokens.org/TR/2025.10/resolver/) | Portable types, aliases and context resolution for I10. The separate preview draft warns against implementing it; use published versioned documents. |
| [Playwright visual comparisons](https://playwright.dev/docs/test-snapshots) | Rendering environment affects reproducibility. Supports capture provenance and bounded state matrices. |
| [W3C target-size guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum) | Minimum target size has exceptions; supports careful advisory F3/I9 wording. |
| [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/) | OIDC publishing, supported execution environments and automatic provenance. Supports G2's direction, with implementation-time verification of runtime/tool constraints. |

Local evidence inspected: `client.ts`, `operation.ts`, `snippet.ts`, `registry.ts`, `project-snippets.ts`, `adapters.ts`, `endpoint.ts`, `cli-main.ts`, instance config/connection, read snippets, export/baselines and their config; Marwes token diff/planning/application, commands and executable theme input; compatibility/release docs, release script, and relevant test fixtures. All paths are under the repository identified at the top of this brief.

Key anchors: `client.ts:executeCode` (unclassified suspended retries); `operation.ts:runOperation` (no generic pinned precondition); `registry.ts:136` (empty evidence accepted); `cli-main.ts:345–353` (config errors suppress guard); `cli-main.ts:417–422` (unstable export saved); `baselines.ts:80,112–140` (capture/provenance); `snippets/read.ts:tree,tokensDump,audit` (lossy/bounded reporting); `marwes-ui/src/penpot.ts:compareToPenpot,planPush,applyPlan` (membership, overwrites, partial application). Core locators are under `packages/core/src`.

## 8. What Codex validated, and what remains unverified

- **Passed:** `pnpm check` on `c38f832`: build, typecheck, 242 tests (166 core, 48 adapter, 28 Docker), and lockstep versions at 0.1.3.
- **Reproduced without Penpot:** invoking the default registered-write verifier with empty inspect/apply/readback returns no problems, which the runner treats as verified success (I2).
- **Document checks:** 40 unique backlog IDs (28 retained, 12 added), each represented once in the delivery checklist; no implemented feature is implied by a checked box.
- **Not run:** live Penpot calls or writes, new capability checks on 2.18.3/2.18.4, hosted archive export/import, browser rendering, multi-user lock tests, npm publishing, or package smoke. Package contents did not change.
- **Not independently inspected:** Tradient, Sourcer, Reflection, Marwes source repositories, or Claude's dashboard helper files. Their behavior and session details remain Claude-reported. This review checked penpair and public upstream documentation.
- **Scope:** this brief only. No product implementation, commits, version bumps, deployments, scheduled jobs, or messages to upstream maintainers. The repository's PLAN.md is unchanged because no implementation milestone was completed.


<a id="completion-reports"></a>
## Completion reports

Append reports here in completion order; each checked item links to its report.

<a id="i1-completion-2026-10-21"></a>
### 2026-10-21 — I1: invalid config must stop guarded commands

- **Resolved:** An unreadable, malformed or schema-invalid project file can no longer be treated as an unconfigured folder, silently falling back to a global endpoint and skipping the instance guard. Core and adapter entry paths reject invalid config before endpoint discovery, tool calls or extension imports. Only a genuinely absent file permits setup/init to create a new config; dangling config symlinks are treated as unreadable.
- **Changed:** Shared validated configuration loading with distinct missing/unreadable/invalid-JSON/invalid-config errors; removed swallowed errors in CLI/registry paths. Added offline `penpair config check [--json]` and `penpair config schema` (also exported as `projectConfigSchema`). Config-free built-in inspection now requires `--standalone` and refuses configured projects, registered snippets and document writes. Preserved adapter-owned fields. Updated setup/init, guide, shipped design skill, changelog, PLAN.md and package-smoke coverage. Committed as `e43a8b3` on `codex/penpair-improvements`.
- **Validated:** `pnpm check` passed: build, typecheck, 273 tests (197 core, 48 adapter, 28 Docker), neutrality/boundary/release guards and lockstep 0.1.3 versions. The 31 new config-safety tests cover malformed JSON, non-object config, invalid profile/fields, permission-denied and other read failures, dangling symlinks, rejection before imports/discovery, explicit standalone reads, blocked standalone writes and retained instance guarding. `pnpm smoke:package` passed for all five packed packages, including installed CLI schema/check commands. `git diff --check` passed.
- **Risks:** No live Penpot run; this item tests local config and pre-connection control flow with fakes. Core config validation leaves adapter-specific settings to each adapter. The JSON Schema provides editor hints; runtime validation also enforces semantic constraints such as unique baseline IDs and distinct ports. `--standalone` deliberately retains normal endpoint discovery for config-free inspection and may switch pages or save a local export. Wrong-file prevention on the correct instance remains A1; write-retry and readback-evidence gaps remain A2/I2. No release, version bump or Penpot write performed. The owner subsequently authorized local commits and all backlog work on a review branch.
- **Next:** **A1 — guard the connected file**, queued. Implementation has not started.



<a id="a1-completion-2026-10-21"></a>
### 2026-10-21 — A1: Guard the connected file

- **Resolved:** Every delivered execution now checks the pinned file ID; a file switch between inspection and a later mutation cannot silently redirect a write. Basic reads warn; writes, exports, baselines, deep probes and adapter operations refuse mismatches.
- **Changed:** Added optional file configuration and schema, same-execution guarded client, explicit --any-file override, connect/setup pin confirmation and --pin-file, doctor expected/actual identity, guide/README/setup instructions and project-facts template. I1 is committed as e43a8b3; the delivery tracker is now also versioned in docs/improvements.md for branch review.
- **Validated:** pnpm check passed: build, typecheck, 281 tests (205 core, 48 adapter, 28 Docker), neutrality/boundary/version checks. Eight new tests execute the real guarded plugin code, simulate file switches, test warning/override/size limits, adapter connections and confirmed pinning. pnpm smoke:package passed for all five packages. git diff --check passed.
- **Risks:** No live Penpot writes or terminal onboarding trial performed. Old configurations remain unpinned with a warning until a file is chosen. File checks run at the beginning of each delivered execution; arbitrary trusted plugin code must still target the intended objects and avoid asynchronous target changes. Does not fix ambiguous retries (A2).
- **Next:** A2 — stop ambiguous write retries


<a id="a2-completion-2026-10-21"></a>
### 2026-10-21 — A2: Stop ambiguous write retries

- **Resolved:** Suspension or a lost transport response can no longer silently replay a write. Even an explicit retry count cannot enable retries for write or unclassified code; only declared reads retry.
- **Changed:** Added read/write/unknown execution classification, unique run IDs and ran/uncertain outcomes, write-uncertain errors with inspect-before-resume guidance, snippet execution metadata and explicit operation/adapter/deep-probe phase classification. Updated the guide and write protocol. No final-marker deduplication or exactly-once guarantee is claimed.
- **Validated:** pnpm check passed: build, typecheck, 286 tests (210 core, 48 adapter, 28 Docker), neutrality/boundary/version guards. Fault tests simulate mutation followed by a suspended result, lost transport acknowledgment, explicit requested retries and retryable reads; possible writes execute once. git diff --check passed. Package smoke most recently passed for A1; no package layout changed in this item.
- **Risks:** No live suspended-tab test. A read declaration is trusted project code, not a sandbox. Diagnostic run IDs are not a durable journal or replay token; recovery/resume remains I3. Existing callers of executeCode must explicitly classify genuine reads to retain automatic retries.
- **Next:** I2 — require positive verification evidence


<a id="i2-completion-2026-10-21"></a>
### 2026-10-21 — I2: Require positive verification evidence

- **Resolved:** Empty, missing or primitive readbacks and an empty error list no longer produce verified success. A received acknowledgment is distinct from verified postconditions; malformed or throwing verifiers fail while preserving inspect/apply/readback evidence.
- **Changed:** Registered writes require either an explicit verifier or matching nonempty verification.expected/actual objects. Inspect/apply require explicit acknowledgments; missing apply results report uncertain. Operation outcomes distinguish inspected, verified and failed. Archive and adapter token/structure verification reject missing observations. Updated example fixtures, guide and write protocol.
- **Validated:** pnpm check passed: build, typecheck, 304 tests (226 core, 50 adapter, 28 Docker), neutrality/boundary/version guards. Sixteen verification regression cases and two adapter evidence tests cover empty/primitive/malformed observations, matching actual state, verifier errors, missing acknowledgments and failed structure reads. pnpm smoke:package and git diff --check passed.
- **Risks:** No live Penpot writes. Verifiers and readback scripts are trusted project code; structural comparison cannot prove that a script measured its actual values honestly. Existing custom snippets that relied only on problems: [] must provide observations or an explicit verifier. Visual review and owner approval remain separate. Durable recovery remains I3.
- **Next:** G1 — transport fault tests and scratch smoke harness

## Tracker history

- **2026-10-21 — Research baseline:** Claude's 28 proposals retained, 12 Codex additions included, and 40 items ordered into four delivery gates. Research validation is recorded in section 8.
- **2026-10-21 — Living tracker established:** Added delivery status, one-item workflow, completion/reporting rules, reopening rules and the per-item summary template. All 40 delivery items remain unchecked; I1 is queued first. No implementation started.

- **2026-10-21 — I1 completed:** Marked I1 verified, linked its resolution report, updated progress to 1/40 and queued A1. Repository PLAN.md, docs, skill and changelog updated alongside implementation.

- **2026-10-21 — A1 completed:** Guard the connected file. Progress 2/40; next A2 — stop ambiguous write retries.

- **2026-10-21 — A2 completed:** Stop ambiguous write retries. Progress 3/40; next I2 — require positive verification evidence.

- **2026-10-21 — I2 completed:** Require positive verification evidence. Progress 4/40; next G1 — transport fault tests and scratch smoke harness.
