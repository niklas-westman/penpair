# penpair: living improvement checklist

Versioned delivery plan and reports for `codex/penpair-improvements`. Kept in sync with the owner's design brief.

Written 2026-10-21 after the first real use of penpair 0.1.3 in Tradient (hosted Penpot, `@marwes-ui/react` 1.11.0, a full Dashboard page built and pushed). Audience: Codex (or any coding agent) working in the penpair repository during the day. Everything marked **Observed** happened in that session; everything marked **Idea** is a proposal.

Repository: this checkout (GitHub `niklas-westman/penpair`, branch `main`, MIT).

> **Codex research update — 2026-10-21.** Reviewed against penpair commit `c38f832` (0.1.3), the local source and tests, and current primary documentation. Claude's session observations below are retained as reported evidence; Codex did not repeat that live session. Section **I** adds 12 improvements, section **3** is the authoritative prioritized checklist, and sections **6–8** explain corrections, sources, and research limits. The research baseline left every delivery box unchecked; the Delivery status and Completion reports below track subsequent implementation.

## Delivery status

Last updated: **2026-10-21**. Completed: **37 / 40**. In progress: **none**. Blocked: **G3 live restore proof and D3 snapshot dependency**.

**Now: Branch review — locally eligible work complete; live and owner gates pending** Queued. Work remains on `codex/penpair-improvements` for review before merging.

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

**Source correction (2026-10-21).** Installed React/core 1.11.0 source confirms optional StatTile trend props already exist, and StatCard accepts Card children. The consumer already has SidebarNav. Reprioritized, unsent owner-review draft: `docs/upstream/marwes-requests.md`; historical numerical measurements remain context-scoped until C1 live proof.
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

- [x] **G1 · P1 · M** — Land the HTTP fake server and failure-injection coverage first; keep hosted smoke manual until its editor/session dependency is addressed. Completed 2026-10-21; [resolution report](#g1-completion-2026-10-21).
- [x] **I4 · P1 · M** — Probe capabilities and prefer supported native layout/integrity primitives. Completed 2026-10-21; [resolution report](#i4-completion-2026-10-21).
- [ ] **G3 · P1 · M** — Document manual hosted backup now, then prove export/import on scratch with library assets intact.
  - [x] Bounded API export candidate, manual route/restore guide, opt-in advisory notes; offline tests and package smoke pass.
  - [ ] Live hosted export/import with token/component/assets/render comparison; disposable target not yet provided.
  - [x] Linked structural review snapshots after D3; they do not replace archives.
- [x] **I3 · P1 · L** — Add operation journal, safe resume and optional recovery checkpoints. Completed 2026-10-21; [resolution report](#i3-completion-2026-10-21).
- [x] **A3 · P1 · L** — Deliver team onboarding and stale-plan detection; investigate advisory coordination without promising atomic exclusion. Completed 2026-10-21; [resolution report](#a3-completion-2026-10-21).
- [x] **I5 · P1 · M** — Preserve artifact provenance and publish consistent capture results safely. Completed 2026-10-21; [resolution report](#i5-completion-2026-10-21).
- [x] **I7 · P1 · M** — Standardize result/error/exit contracts and incomplete-output reporting. Completed 2026-10-21; [resolution report](#i7-completion-2026-10-21).
- [x] **I11 · P1 · M** — Make executable extension trust explicit and avoid unnecessary imports. Completed 2026-10-21; [resolution report](#i11-completion-2026-10-21).
- [x] **B5 · P1 · S** — Publish dated, version-scoped gotchas from the real run. Completed 2026-10-21; [resolution report](#b5-completion-2026-10-21).
- [x] **E2 · P1 · S** — Add idempotent instruction-file integration with explicit destination and preview. Completed 2026-10-21; [resolution report](#e2-completion-2026-10-21).
- [x] **B3 · P1 · S** — Export by unambiguous name/ID and reuse the exporter for ad-hoc shots. Completed 2026-10-21; [resolution report](#b3-completion-2026-10-21).
- [x] **B4 · P1 · M** — Settle with bounded native/fallback checks and independent exports. Completed 2026-10-21; [resolution report](#b4-completion-2026-10-21).

### Gate 3 — make one repeatable design-to-code path work

- [x] **I8 · P1 · M** — Add structured, complete inspection with bounded payloads. Completed 2026-10-21; [resolution report](#i8-completion-2026-10-21).
- [x] **C2 · P1 · M** — Manage project-owned extra sets and safe token CRUD. Completed 2026-10-21; [resolution report](#c2-completion-2026-10-21).
- [x] **I6 · P1 · M** — Add explicit ownership, conflicts and reference-aware destructive plans. Completed 2026-10-21; [resolution report](#i6-completion-2026-10-21).
- [x] **C3 · P1 · M** — Verify actual precedence and resolved values per theme; restore selection reliably. Completed 2026-10-21; [resolution report](#c3-completion-2026-10-21).
- [x] **B1 · P1 · M** — Run reviewed script files through the corrected execution protocol. Completed 2026-10-21; [resolution report](#b1-completion-2026-10-21).
- [x] **B2 · P1 · L** — Ship a small neutral helper slice, then expand from demonstrated recipes. Completed 2026-10-21; [resolution report](#b2-completion-2026-10-21).
- [x] **I9 · P1 · M** — Cover explicit responsive/theme/state cases with deterministic captures. Completed 2026-10-21; [resolution report](#i9-completion-2026-10-21).
- [x] **H1 · P1 · S** — Present the scoped consumer follow-ups for owner authorization; perform no cross-repo edits here. Completed 2026-10-21; [resolution report](#h1-completion-2026-10-21).
- [x] I12 preparation: controlled examples, offline recovery/contention fixtures and `docs/trials.md`; actual human trials remain unchecked below.
- [ ] **I12 · P1 · M** — Complete measured human onboarding and collaboration trials; publish findings.

### Gate 4 — expand only where the pilot demonstrates value

- [ ] **C1 · P2 · L** — Pilot measurement and drift on Button/Card/StatTile; gate library generation on preserved instance overrides.
  - [x] Schema-1 measured pilot, source freshness and actual-renderer drift checks, explicit contexts and ambiguous token candidates.
  - [ ] Real fixture/native component instance override proof and measured constants; generation remains gated.
- [x] **D1 · P2 · L** — Build handoff from structured inspection and explicit component mappings; surface unknown semantics. Completed 2026-10-21; [resolution report](#d1-completion-2026-10-21).
- [x] **D4 · P2 · M** — Extract Reflection integration only after the existing baseline path proves an unmet need. Completed 2026-10-21; [resolution report](#d4-completion-2026-10-21).
- [x] **E1 · P2 · L** — Expose the same guarded command services as typed MCP tools, pinned to an explicit project root. Completed 2026-10-21; [resolution report](#e1-completion-2026-10-21).
- [x] **E3 · P2 · M** — Package proven recipes/handoff practices as focused skills after commands stabilize. Completed 2026-10-21; [resolution report](#e3-completion-2026-10-21).
- [x] **D2 · P2 · M** — Record owner approvals against exact artifact hashes and preserve their provenance. Completed 2026-10-21; [resolution report](#d2-completion-2026-10-21).
- [x] **D3 · P2 · L** — Add deterministic structural snapshots and review diffs atop I8. Completed 2026-10-21; [resolution report](#d3-completion-2026-10-21).
- [x] **I10 · P2 · M** — Add format migrations and a documented portable token subset; version new schemas earlier. Completed 2026-10-21; [resolution report](#i10-completion-2026-10-21).
- [x] **F1 · P2 · M** — Restructure docs from tested user paths; write minimal team/recovery notes in Gate 2. Completed 2026-10-21; [resolution report](#f1-completion-2026-10-21).
- [x] **F2 · P2 · S** — Add web status/open using the shared identity and capability report. Completed 2026-10-21; [resolution report](#f2-completion-2026-10-21).
- [x] **F3 · P2 · M** — Add configurable audits with explicit assumptions, severity and unknowns. Completed 2026-10-21; [resolution report](#f3-completion-2026-10-21).
- [x] **C4 · P2 · S** — Add advisory theme-family lint with suppressions for intentional brand choices. Completed 2026-10-21; [resolution report](#c4-completion-2026-10-21).
- [x] **A4 · P2 · M** — Add credential-file/OS integration; defer command providers until justified. Completed 2026-10-21; [resolution report](#a4-completion-2026-10-21).
- [x] **G2 · P2 · M** — Prepare owner-approved trusted publishing/provenance while keeping lockstep release guards. Completed 2026-10-21; [resolution report](#g2-completion-2026-10-21).
- [x] **H2 · P2 · S** — Present measured upstream Marwes requests; let the owner decide what to send. Completed 2026-10-21; [resolution report](#h2-completion-2026-10-21).

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


<a id="g1-completion-2026-10-21"></a>
### 2026-10-21 — G1: Transport fault tests and scratch smoke harness

- **Resolved:** The connection path is now exercised over real HTTP through the installed MCP SDK, including authentication rejection, read retry and acknowledgment loss without write replay. Deep checks cannot pass with missing step/cleanup evidence.
- **Changed:** Added an HTTP fake MCP server, generated color/font/typography normalization invariants, a scratch-file/origin/version-pinned live smoke library/CLI, and a protected-environment manual-dispatch workflow with redacted reports. Scheduling remains deliberately deferred until the required authenticated editor lifecycle is solved, as amended in the research plan.
- **Validated:** pnpm check passed: build, typecheck, 316 tests (236 core, 52 adapter, 28 Docker), neutrality/boundary/version checks. HTTP fault tests use loopback only. Smoke preflight tests refuse unconfirmed/wrong-file/version-drift targets before writes and verify complete deep-check evidence. pnpm smoke:package passed. pnpm smoke:live without arguments correctly refused with usage and exit 1, without connecting. git diff --check passed.
- **Risks:** No live Penpot smoke was run; the first owner-authorized scratch execution remains an integration trial. The manual workflow has not run on GitHub and requires a protected penpot-smoke environment, secret and foreground authenticated editor/plugin. No nightly schedule or infrastructure was activated. Compatibility version tables are unchanged; native behavior remains unverified until the actual trial.
- **Next:** I4 — capability-driven native API support


<a id="i4-completion-2026-10-21"></a>
### 2026-10-21 — I4: Capability-driven native API support

- **Resolved:** Native APIs are detected instead of assumed, and unsupported/throwing methods cannot silently establish layout or file integrity. Optional named checkpoints use explicit apply and independent readback.
- **Changed:** Probe schema/version/time/target metadata and native method presence; optional probe --integrity with failing status for real issues; reusable bounded native-or-geometry layout wait; optional run-keyed version checkpoint helper with file-switch guard and no automatic rollback. New helpers are exported for the runner and adapters. Documentation distinguishes method presence, simulated tests and actual live compatibility.
- **Validated:** pnpm check passed with 328 tests (248 core, 52 adapter, 28 Docker), build/typecheck/neutrality/boundary/version checks. Twelve new cases cover old/new/throwing APIs, native timeout, unsettled geometry, target changes, integrity errors, checkpoint inspect/apply/readback/reuse and read-only capability probing. pnpm smoke:package passed during this item; final evidence-validation tightening was followed by pnpm check. git diff --check passed.
- **Risks:** No native API live checks on pinned 2.18.3/2.18.4; compatibility table remains unchanged. Layout completion does not establish token/font/pixel correctness. Version history is a recovery aid, not a restored independent backup or an atomic lock. Default write/export settling integration remains B4; operation journaling remains I3.
- **Next:** G3 — hosted-file backup and restore proof


### 2026-10-21 — G3 progress: backup candidates built; restore proof pending

- **Resolved so far:** Bounded full-file export candidates now check identity/revision and byte length, print a hash, refuse to overwrite prior backups, and fall back to manual export on unsupported/failed/oversized results. Optional advisory notes are disabled unless configured.
- **Changed:** Added `backup file`, exporter/backup-note helpers and schema, doctor warning output, backup/restore guide and compatibility notes. Archive bytes and owner-maintained notes explicitly do not prove a restore.
- **Validated:** `pnpm check` passed (340 tests: 260 core, 52 adapter, 28 Docker) and `pnpm smoke:package` passed. Twelve new tests cover export outcomes, changed revision, budget, existing-backup protection, disabled/fresh/stale/malformed/mismatched/unverified notes. `git diff --check` passed.
- **Remaining:** Live hosted archive export/import and content/render comparison require a disposable target; D3's structural snapshot safety net is a later dependency. G3 remains unchecked. No live Penpot writes or compatibility claims were made.
- **Next:** I3 — journal and explicit recovery/resume; independent of the missing live target.


<a id="i3-completion-2026-10-21"></a>
### 2026-10-21 — I3: Recoverable operations and checkpoints

- **Resolved:** Interrupted multi-step writes can now be inspected and explicitly resumed against actual state without blindly replaying completed mutations.
- **Changed:** Private redacted local journals record target/revision, input/source hashes, original actions, pre-write started markers and independent verification. CLI archive/registered writes and adapter token pushes support explicit resume, offline runs inspection and optional required native checkpoints. Residual token work is rebuilt; conflicts stop recovery.
- **Validated:** pnpm check passes: 354 tests (270 core, 56 adapter, 28 Docker), including acknowledgment loss at every fresh-push batch boundary, partial rejection, changed inputs, third values, required checkpoint refusal, permissions/redaction and actual operation-source execution. pnpm smoke:package and git diff --check pass.
- **Risks:** No live scratch recovery/restore proof. Multi-step builds are non-transactional; no automatic rollback. Unmodeled partial custom writes and ambiguous archive ownership stop for inspection. Cross-writer coordination remains A3; filesystem journals are local recovery evidence, not backup restore proof.
- **Next:** A3 — team onboarding, advisory coordination and stale-source checks


<a id="a3-completion-2026-10-21"></a>
### 2026-10-21 — A3: Team onboarding and advisory write coordination

- **Resolved:** Colleagues get a project-specific onboarding checklist, and journaled writers detect ordinary contention and stale revisions/sources before mutation.
- **Changed:** Offline onboard/JSON; private exclusive locks for one checkout; capability-driven shared writer markers with independent acquisition readback, per-step checks, expiry and explicit force-lock. Live local processes cannot be forced out. Same-execution revision checks cover journaled operations; archives recheck candidate identities and adapters compare source state immediately before mutation. Added team guidance and explicit unsupported/non-atomic behavior.
- **Validated:** pnpm check passes: 363 tests (278 core, 57 adapter, 28 Docker). Tests cover acquisition/release, active conflict, expiry, explicit takeover, malformed markers, local running/dead owners, ownership loss, source edits between inspection and delivery, and stale revision refusal. pnpm smoke:package and git diff --check pass.
- **Risks:** Shared plugin data has no atomic compare-and-swap: concurrent machines and forced takeovers are advisory, never distributed exclusion. Local locks protect one checkout; human editing remains possible. Unsupported shared methods warn and retain local exclusion only. Direct unjournaled library helpers and scratch probes require manual coordination. No live two-editor trial; direct file links may need the owner's full team-context URL.
- **Next:** I5 — artifact provenance, consistent capture and atomic publication


<a id="i5-completion-2026-10-21"></a>
### 2026-10-21 — I5: Artifact provenance and consistent atomic publication

- **Resolved:** A new capture can no longer relabel an old approved image with the current revision, and incomplete captures cannot publish a misleading complete manifest.
- **Changed:** Schema-2 manifests separate capture/approval IDs, revisions, hashes, scale, themes, tool/API version and available render environment. Immutable capture generations retain earlier approved paths. Exports validate byte evidence and identity/revision across captures; baselines recheck the full listing. Staged generations precede atomic manifest-last publication. Raw PNG outputs stage complete stable bytes; archive publication is exclusive and atomic.
- **Validated:** pnpm check passes: 371 tests (286 core, 57 adapter, 28 Docker). Regression cases cover retained approval provenance, file/revision changes, missing/unstable frames, failed export, cancellation during staging, malformed byte evidence, concurrent exclusive output and preserved old output. pnpm smoke:package and git diff --check pass.
- **Risks:** No live export trial. Unknown font/render dependencies remain explicit; browser/API metadata does not prove font correctness. Atomicity applies to each local publication, not a power-loss-proof multi-file transaction. Root Reflection cases are a convenience: pair by captureId or follow the manifest's immutable casesFile. Interrupted output can leave unreferenced generations. Existing integrations that hard-code id.png must follow generated paths. Legacy approvals keep unknown provenance instead of inventing a revision.
- **Next:** I7 — stable command results, structured MCP envelopes and incomplete-output contracts


<a id="i7-completion-2026-10-21"></a>
### 2026-10-21 — I7: Versioned command results and interruption contracts

- **Resolved:** Automation can distinguish completed, drifting, incomplete, failed, cancelled and uncertain commands without parsing human prose or losing truncation evidence.
- **Changed:** Shared runCommand service/type/schema; one versioned JSON stdout document with data, target/run evidence, completeness, timings and structured errors. Progress uses stderr. Core and bundled adapter adopt it; existing JSON roots move under data. Added strict flag/numeric validation, explicit exit codes, cooperative overall deadlines and SIGINT/SIGTERM handling, plus validated structured MCP executor envelopes with legacy compatibility. Updated smoke consumers and setup guidance.
- **Validated:** pnpm check passes: 383 tests (297 core, 58 adapter, 28 Docker). Contract fixtures cover offline success, invalid config, adapter drift/status, redaction, truncation, suspension, malformed structured responses, cancellation and deadlines. Real HTTP tests cancel stalled reads/writes and confirm no write replay. Bundled adapter snapshot/check/status use the actual common envelope. pnpm smoke:package and git diff --check pass.
- **Risks:** JSON shape is deliberately changed: prior top-level command fields now live under data. Interactive setup/connect refuse JSON/deadline mode; doctor supplies their subsequent machine-readable check. SDK cancellation does not stop a delivered plugin mutation, so its outcome remains uncertain. Synchronous extensions must cooperate with deadlines. Third-party adapters writing directly to process/global console streams must migrate to context.output; they are not sandboxed. No live interruption test.
- **Next:** I11 — lazy extension loading and explicit executable-code trust boundaries


<a id="i11-completion-2026-10-21"></a>
### 2026-10-21 — I11: Lazy executable extensions and explicit trust boundaries

- **Resolved:** Built-in help and inspection no longer execute configured adapters unnecessarily, and selected local executable entry points cannot silently escape the project through traversal or symlinks.
- **Changed:** Lazy adapter discovery for extension commands only; help names configured extensions without importing them. Built-in registry runs skip project snippet modules and snippets/run accept builtins-only. Canonical local adapter/snippet/theme entry paths are bounded to the project; installed package resolution remains supported. Added a labeled literal design-data formatter, quoted multiline tree labels, trust guidance and agent instructions.
- **Validated:** pnpm check passes: 389 tests (302 core, 59 adapter, 28 Docker). Side-effect fixtures prove no imports for built-in help/config/onboard/runs/built-in snippet inspection, while an explicitly requested extension executes. Tests cover inside/outside symlinks, directory escapes, actual theme entry-point refusal, malicious Markdown fences/directional controls, and multiline layer labels. pnpm smoke:package and git diff --check pass.
- **Risks:** Extensions and transitive imports retain full Node privileges; read labels are declarations, not sandboxing. Unknown extension command discovery can import all configured adapters. Absolute/escaping local entry points now need a project wrapper or installed package. Later documentation exporters must reuse the literal-data formatter. No live Penpot operation was needed or run.
- **Next:** B5 — publish the dated, version-scoped build gotchas


<a id="b5-completion-2026-10-21"></a>
### 2026-10-21 — B5: Dated and version-scoped build gotchas

- **Resolved:** The build brief's operational knowledge is now shipped with the design skill instead of remaining in one session, with evidence scope and safe workarounds visible.
- **Changed:** Added thirteen dated hosted-2.18.4 reference sections covering layout sizing, blank text, opacity, formulas/themes, component restrictions/creation, binding keys, font application, icon aspect ratio, settling and suspension. The compatibility guide distinguishes reported observations from branch reproductions. Core/Docker doctor hints suggest a visible separate window; suspension guidance follows read-only retry and uncertain-write recovery.
- **Validated:** pnpm check passes: 389 tests, including shipped-skill and neutrality checks. git diff --check passes. Package layout did not change; the prior I11 package smoke passed. No new live run or packaging smoke was needed for these reference/hint changes.
- **Risks:** These thirteen brief observations were not independently rerun here. The references are scoped to reported hosted 2.18.4 behavior, not universal API rules. Recipe enforcement remains B2 and default settle integration remains B4; no new live compatibility pass is claimed.
- **Next:** E2 — owned-marker instruction integration with explicit destination and dry-run preview


<a id="e2-completion-2026-10-21"></a>
### 2026-10-21 — E2: Owned-marker instruction integration and preview

- **Resolved:** Skill installation can integrate its own rows into an explicitly resolved instruction file without manual copy/paste, duplicating rows, or overwriting unrelated instructions.
- **Changed:** skills install/setup accept an agents destination. A single existing AGENTS.md or CLAUDE.md is reused; absent files require explicit selection and conflicting defaults are reported incomplete. Marked blocks update idempotently, malformed markers fail before copies, and concurrent instruction edits are preserved. Dry-run plans every file/link and owned-block diff without writes. Output paths reject symlink escapes/dangling links; Markdown paths follow the actual skill/instruction folders. Complete files are published atomically and existing permissions are preserved.
- **Validated:** pnpm check passes: 401 tests (314 core, 59 adapter, 28 Docker). Tests cover first install/repeat, absent/default/ambiguous files, malformed markers, CRLF/outside text preservation, nested/space-containing paths, preview with zero filesystem writes, concurrent owner edits and symlink refusal. pnpm smoke:package additionally verifies preview, application and no-op from installed tarballs. git diff --check passes.
- **Risks:** Installation is a sequence of local file publications, not a multi-file transaction; errors can leave skill copies applied while instruction changes are refused. Both instruction files require explicit owner selection. Setup follows the same destination policy and reports missing selection; it does not silently create or choose competing instruction files. No global instructions or this repository's AGENTS.md were edited by running the feature.
- **Next:** B3 — unambiguous named exports, ad-hoc shots and option hints


<a id="b3-completion-2026-10-21"></a>
### 2026-10-21 — B3: Exact-name exports and complete ad-hoc shots

- **Resolved:** A rebuild no longer requires a separate ID-discovery script before capturing a uniquely named frame, and one-off screenshots no longer need baseline approval configuration.
- **Changed:** Exact page-scoped name lookup/export refuses zero/multiple matches, duplicate page names, incomplete search and stale lookup/capture identity. Added shots for prefix-selected top-level frames, immutable complete capture generations, PNG dimensions/hash/provenance and manifest-last publication without baseline approvals. Nearby-option hints explain typos without changing execution. Built-in standalone capture remains explicit.
- **Validated:** pnpm check passes: 410 tests (323 core, 59 adapter, 28 Docker). Actual plugin-source fixtures cover unique/missing/duplicate names, duplicate pages, revision changes, retained shot generations, empty/failed captures and preservation of previous manifests. A CLI test verifies selected PNG bytes and capture identity. Option-hint and snippet compilation tests pass. pnpm smoke:package and git diff --check pass.
- **Risks:** No live named-export/shot trial. Name search is bounded at 10000 nodes and shots at 100 selected frames; narrow the scope rather than treating partial output as complete. Captures establish technical stability/provenance, not visual approval or font correctness. Interrupted publication may leave an unreferenced generation; old referenced generations remain intact.
- **Next:** B4 — integrate bounded layout settling into operations and exports


<a id="b4-completion-2026-10-21"></a>
### 2026-10-21 — B4: Bounded layout settling in normal write and capture paths

- **Resolved:** Normal operations no longer treat an unconditional sleep as layout proof, and export/recovery cannot silently accept moving, malformed, late or timed-out geometry.
- **Changed:** Integrated capability-driven native/fallback layout checks into operation verification/recovery, exports, captures and token pushes. Journals settle before planning and on reconciliation; measured layout evidence appears in reports/artifact provenance. Layout observations forward remaining per-request budgets through guards to the SDK without suspension retries. Removed the default ten-second operation sleep while retaining an explicit bounded minimum for measured asynchronous contracts. Stable renders and positive readback remain separate.
- **Validated:** pnpm check passes: 417 tests (329 core, 60 adapter, 28 Docker). Actual plugin-source tests cover changing geometry, native/fallback completion, malformed/late samples, failed verification, stable-render checks after settlement and post-write recovery without duplication. A real stalled HTTP request proves timeout propagation through the file guard. Adapter post-batch settlement failure resumes safely. pnpm smoke:package and git diff --check pass.
- **Risks:** No live pinned-version settling trial. Native/geometry completion does not establish token persistence, font correctness or visual approval; delayed bindings can still fail positive readback and require explicit recovery or a measured minimum delay. Custom clients must honor request budgets. Explicit library opt-out requires the caller's own evidence. Build-kit reuse remains B2; no new live compatibility claim or transactional guarantee.
- **Next:** I8 — structured, complete inspection with bounded payloads and revision-bound cursors


<a id="i8-completion-2026-10-21"></a>
### 2026-10-21 — I8: Structured inspection and measured transfer budgets

- **Resolved:** Full text and typed composites can now be collected without silently treating clipped previews as complete evidence.
- **Changed:** Added version-1 shape/token inspection, Unicode-safe bounded transfers, file/revision/content-bound cursors, explicit unknowns, validated reassembly, atomic complete captures and execution metrics. Tree/audit retain readable previews with totals and truncation. Output redaction marks affected data incomplete and preserves previous artifacts. Formats and migration are documented in docs/inspection.md.
- **Validated:** pnpm check: 440 tests passed (352 core, 60 adapter, 28 Docker), build/typecheck/version guards passed. pnpm smoke:package and git diff --check passed. Offline 1k/10k fixtures cover Unicode, composites, budgets, getter-backed APIs, stale cursors and malformed evidence.
- **Risks:** No new live pinned-version trial. Projection includes explicit unknowns, including mixed text ranges. Chunking recomputes source; the content fingerprint is noncryptographic and final SHA-256 is integrity evidence, not authentication. Live latency remains unmeasured.
- **Next:** C2 — project-owned extra sets and guarded token CRUD


<a id="c2-completion-2026-10-21"></a>
### 2026-10-21 — C2: Declared project extras and guarded token editing

- **Resolved:** Project token sets can be recreated from config and participate in snapshot/check/diff/push; one-off token edits use the same guarded write and recovery contract.
- **Changed:** Added neutral add-set/set/remove/promote operations, source rechecks, conservative reference/binding refusal and independent state verification. Promotion copies without deleting its source. Added validated marwes.extras, schema-2 ownership maps, legacy snapshot review support and atomic publication. Component-derived constants remain assigned to C1 measured fixtures rather than invented here.
- **Validated:** pnpm check passed: 450 tests (359 core, 63 adapter, 28 Docker), build/typecheck/version guards. Package smoke and diff whitespace checks passed. Simulated writes cover idempotency, source changes, lost acknowledgment recovery, rejected operations, ignored writes and extra-set drift.
- **Risks:** No live mutation trial. Large complete preconditions can refuse the 90 KB request guard safely. One-off edits do not update declarations; ownership conflict reconciliation is I6 and actual theme precedence is C3. C1 must supply measured component constants.
- **Next:** I6 — ownership conflicts and reference-aware destructive plans


<a id="i6-completion-2026-10-21"></a>
### 2026-10-21 — I6: Ownership conflicts and reference-aware reconciliation

- **Resolved:** Designer edits and upstream changes are distinguished before pushes; unmanaged tokens and retained references are protected during destructive plans.
- **Changed:** Added property-level three-way reports and private file-bound verified ancestors, explicit overwrite decisions and local adoption proposals. Prune needs ancestry and preserves unmanaged tokens/sets/theme membership. Destructive dependencies are rechecked inside mutations. Inspection pins file/revision through apply; ancestor publication is atomic, locally locked and refuses unexpected concurrent advancement.
- **Validated:** pnpm check passed: 460 tests (359 core, 73 adapter, 28 Docker), build/typecheck/version guards; package smoke and git diff --check passed. Fixtures cover upstream/designer/conflicting/convergent changes, renames, project extras, cross-set references, late dependencies, adoption, file changes, ancestor tampering and concurrent advancement.
- **Risks:** Ancestors are local evidence rather than shared authentication; a new checkout requires an explicit decision for differing existing values. Adoption is a review proposal that must enter declarations, not an automatic edit to upstream generation. Conservative dependency refusal can require separate reviewed changes. No new live mutation trial; actual resolution is C3.
- **Next:** C3 — actual per-theme resolution and reliable selection restoration


<a id="c3-completion-2026-10-21"></a>
### 2026-10-21 — C3: Actual mode resolution and complete selection restoration

- **Resolved:** Declared membership no longer stands in for actual per-theme resolution: isolated mode trials read live resolved values, expose global order drift and independently verify restoration of every original theme/set flag.
- **Changed:** Added diff --resolved and verify-modes inspection/apply paths, bounded reference/arithmetic expectations, actual resolved sampling and explicit unknowns. Journaled compound trials restore in finally with bounded cancellation cleanup. Stable per-mode images carry provenance and publish coherent generations only after restoration. Redacted journal evidence remains incomplete across operations and token services.
- **Validated:** pnpm check passed: 477 tests (361 core, 88 adapter, 28 Docker), build/typecheck/version guards; package smoke and git diff --check passed. Fixtures cover order mistakes, multi-group/custom restoration, ignored activation, lost acknowledgment, cancellation, source changes, missing capabilities/values, restoration failure, redaction, artifact preservation and CLI wiring.
- **Risks:** No live pinned-version mutation trial. Contexts are isolated themes, not every combination of brand/density axes. Unsupported formulas/units, nested font forms and composite shadows remain unknown. Cancellation cleanup is cooperative; restoration failure needs inspection. Images are review evidence, not baseline approval.
- **Next:** B1 — guarded script-file execution with honest trust and verification outcomes


<a id="b1-completion-2026-10-21"></a>
### 2026-10-21 — B1: Reviewed plugin bodies from files

- **Resolved:** Project scripts can run through the core file/page/size guards with ordered helpers and literal parameters, rather than a throwaway transport runner.
- **Changed:** Added offline source loading/compilation and run-file. Trusted reads require declarations; writes preserve the repository write protocol through idempotency declarations and explicit inspect/readback files, with positive evidence, journals and recovery. Unverified arbitrary writes refuse instead of claiming verification. Documented the stricter refinement to Claude's raw executor proposal. Also fixed CLI admission of token-edit recovery/checkpoint flags.
- **Validated:** pnpm check passed: 484 tests (368 core, 88 adapter, 28 Docker), build/typecheck/version guards; package smoke and git diff --check passed. Tests cover include order, UTF-8 wrapped size, syntax, realpath boundaries, page guarding before includes, positive evidence, lost acknowledgment, changed-source resume refusal, lazy extensions and actual token-edit CLI resume.
- **Risks:** Read-only/idempotency declarations remain trusted code contracts and cannot sandbox JavaScript. Script authors own meaningful postconditions and in-mutation source checks. Large runtime inspections can safely exceed the final request guard before delivery. No new live write trial or automatic visual approval.
- **Next:** B2 — neutral build kit and adapter-owned recipes


<a id="b2-completion-2026-10-21"></a>
### 2026-10-21 — B2: Neutral build kit and adapter-owned recipes

- **Resolved:** Reusable plugin helpers replace throwaway preludes while keeping token bindings after value/font changes and keeping library knowledge outside the core.
- **Changed:** Added plain kit() source and explicit @kit includes, typed layout/text/icon/component helpers, queued style/binding work, bounded settling, recipe registration and offline kit check/recipes commands. Generic adapter kit aliases preserve lazy imports. Added adapter card/segmented/progress/icon/stat recipes with explicit project constants, a repeatable reviewed Hello-card example, and an opt-in scratch kit probe that exports, cleans its owned root and independently verifies the original page. Spacing versus sizing bindings follow current API references.
- **Validated:** pnpm check passed: 502 tests (383 core, 91 adapter, 28 Docker), build/typecheck/version guards. Package smoke and git diff --check passed. Fixtures cover binding order, active precedence, exact font faces, preserved styling, icon ratio, ambiguous overrides, bounded settling, kit loading, actual CLI aliases, cleanup, lost acknowledgment, redaction, stable preview publication and repeatable example IDs; failed deep probes skip further kit mutations.
- **Risks:** No new live pinned-version probe. Helper queues are in-memory and not transactions; enclosing operations own partial roots. Adapter recipes are compositional starting points, not measured native-component parity (C1). Saved previews require visual review and never imply approval.
- **Next:** I9 — explicit state, theme and responsive coverage


<a id="i9-completion-2026-10-21"></a>
### 2026-10-21 — I9: Explicit state, theme and responsive coverage

- **Resolved:** Baseline coverage now distinguishes configured capture completeness from approved case intent, unsupported/missing combinations and browser/accessibility work that has not run.
- **Changed:** Added bounded case metadata and required matrices, version-1 coverage reports and an offline coverage command that independently checks approved PNG bytes and file pins. Viewport/native-theme assertions reject mismatches without publication. Metadata or source-identity changes require approval even with identical pixels; metadata is pinned before asynchronous capture. Rich cases preserve provenance in pending provider mappings; legacy multi-viewport checks remain intact. Hardened baseline paths against external symlink escapes.
- **Validated:** pnpm check passed: 514 tests (395 core, 91 adapter, 28 Docker), build/typecheck/version guards; package smoke and git diff --check passed. Matrix fixtures include desktop/mobile, light/dark and empty states. Tests cover gaps, unsupported cases, old/changed metadata, corrupt images, file pins, environment unknowns, preserved artifacts, concurrent metadata mutation and project path bounds. Example matrix validates.
- **Risks:** Theme/state/fixture labels are declared intent, not proof of activation or application behavior. Actual native theme IDs can be asserted separately. Font loading/version and browser interactions remain unverified; rich cases await D4 provider setup. No board dimensions imply WCAG compliance. No new live capture trial.
- **Next:** H1 — scoped consumer follow-up proposal without cross-repository edits


<a id="h1-completion-2026-10-21"></a>
### 2026-10-21 — H1: Scoped Tradient follow-up proposal

- **Resolved:** Consumer adoption work is now a concrete owner-reviewable handoff without applying changes outside this repository.
- **Changed:** Added docs/tradient-followups.md with script/CI/env proposals, reviewed-build prerequisites, file-pin and schema-2 migration steps, project extras, baseline approval/route decisions and frontend/rebuild follow-ups. Read-only verification confirmed main at 3aa7a1c, absent design scripts/pin/baselines, schema-1 snapshot and an existing SidebarNav that should be reused rather than duplicated. All consumer action boxes remain unchecked.
- **Validated:** Proposal JSON fragments parse, links/commands were checked against current local source, and git diff --check passed. Consumer status before and after remained the same pre-existing untracked penpot-poc directory. No new runtime tests were needed for this documentation-only item; the previous full check remains 514 passing tests.
- **Risks:** Consumer edits, actual file identity, initial design approval, theme choices, old-version visual comparison and implementation/provider adoption still need separate owner authorization. Branch features are unreleased; the existing 0.1.3 version string does not establish that they are installed. No cross-repository write, Penpot mutation, push, deploy or external message occurred.
- **Next:** I12 — prepare and run measured human onboarding/collaboration trials


<a id="d1-completion-2026-10-21"></a>
### 2026-10-21 — D1: Structured design handoff and offline freshness checks

- **Resolved:** Complete design inspections can now become a reproducible implementation handoff with explicit source identities, mapping hints and unknown semantics.
- **Changed:** Added spec generation/check, schema-1 source/mapping fingerprints, exact library/component identity mappings and descendant-only text props. Design content stays literal untrusted evidence; atomic publication refuses partial/redacted trees.
- **Validated:** pnpm check passes (522 tests), recorded-tree golden and hostile-text/hierarchy/mapping checks pass; pnpm smoke:package passes.
- **Risks:** No human adoption trial. Offline freshness is against the supplied structured inspection, not the live file or a PNG. Native adapter mapping generation remains gated on C1; no fabricated component IDs or behavior/accessibility semantics.
- **Next:** D4 — explicit implementation-case integration for Reflection


<a id="d4-completion-2026-10-21"></a>
### 2026-10-21 — D4: Explicit implementation cases and comparison evidence adapter

- **Resolved:** Rich design cases now have an explicit setup/readback bridge instead of being silently compared in a default browser state.
- **Changed:** Added optional @penpair/reflection-check at the existing lockstep version, typed project-provider contract, exact approved provenance checks, independent image/hash/scale validation and pending-case diagnostics. Existing legacy Reflection output stays supported. All six packages retain release guards.
- **Validated:** pnpm check passes (525 tests), including an actual adapter-command integration with a named offline stub and changed-state/font/byte refusals. pnpm smoke:package installs and exercises all six tarballs.
- **Risks:** No live consumer/provider trial. Actual application activation and checker invocation belong to a trusted project provider using its pinned stack. Pixel ratios are evidence, not visual/accessibility approval. Consumer edits remain a separate owner action.
- **Next:** E1 — typed MCP tools pinned to an explicit project root


<a id="e1-completion-2026-10-21"></a>
### 2026-10-21 — E1: Explicit-root typed stdio MCP services

- **Resolved:** Agents can use bounded project-specific tools through the same command services with a lifetime file pin and no mutable process-directory routing.
- **Changed:** Added stdio server, typed validated allowlist, strict file guards even for basic reads, target-change refusal, response budgets, SDK cancellation and explicit registered-write opt-in. Global client endpoint fallback is disabled for server calls. Added request-scoped root support and fixed cancellation immediately before extension invocation.
- **Validated:** pnpm check passes (529 tests); SDK in-memory discovery/refusal/root-isolation tests and six-package smoke pass. Client examples checked against official configuration documentation.
- **Risks:** No live agent/editor trial. Trusted registered modules can execute imports and must preserve protocol stdout; no raw-code tool or sandbox. Cancellation is cooperative. Library-specific typed adapter schemas are not guessed. E3 is sequenced after D2/D3 so it documents stable approval/snapshot commands.
- **Next:** D2 — exact-artifact owner approval records


<a id="d2-completion-2026-10-21"></a>
### 2026-10-21 — D2: Exact-artifact owner words and explicit baseline waivers

- **Resolved:** Changed references can no longer silently become approved through an update flag alone; supplied owner words are bound to exact capture evidence.
- **Changed:** Added append-only schema-1 approval records and immutable PNG evidence with preview-first CLI, bounded validation and local append locking. Changed baseline updates require matching identity/context/hash or a persisted forced-reference reason. Waivers do not satisfy approved rich coverage or comparison plans; later owner approval can promote a waived reference without pixel changes. Added prepublication redaction refusal.
- **Validated:** pnpm check passes (533 tests), including approval tampering/refusal, changed-baseline enforcement, waiver promotion and comparison-plan rejection. Six-package smoke passes.
- **Risks:** No real approvals were recorded. Supplied words are not authenticated identity/consent. Initial explicit capture retains existing reference behavior; old references are not retroactively attributed to owner words. Revision matching is deliberately conservative.
- **Next:** D3 — deterministic structural snapshots and review diffs


<a id="d3-completion-2026-10-21"></a>
### 2026-10-21 — D3: Deterministic page-split structural review snapshots

- **Resolved:** Design structure, text, bindings and token changes can now be reviewed as bounded versioned artifacts rather than only opaque pixels.
- **Changed:** Added whole-file page-root collection, complete same-revision token evidence, deterministic schema-1 page artifacts, immutable generations and atomic hash-checked manifests. Offline diffs retain literal untrusted design data and report truncation explicitly. Added backup-guide cross-link.
- **Validated:** pnpm check passes (537 tests), including actual inspection-body collection of loose root children, determinism, field diffs, altered-byte/refusal and older-revision preservation. Six-package smoke passes.
- **Risks:** Review-only fidelity: no embedded external assets/history and no full native restore guarantee. Page names must be unique for current selection APIs. Captures can leave the last inspected page open. Hosted archive/restore and native override trials remain pending.
- **Next:** E3 — focused recipes and handoff skills


<a id="e3-completion-2026-10-21"></a>
### 2026-10-21 — E3: Focused recipe and handoff skills

- **Resolved:** Agents now have concise construction and handoff workflows aligned with the implemented guarded commands, rather than an expanding all-purpose operations skill.
- **Changed:** Added penpair-recipes and penpair-handoff with disclosed local workflow references, explicit completion criteria and actual evidence/approval boundaries. Shortened penpair-design, updated stale settling/recovery guidance, installer expectations and five-skill package smoke coverage.
- **Validated:** pnpm check passes (537 tests); all five skills install from tarballs and package smoke passes. Skill-creator validation passes for the three new/revised entrypoints using an isolated temporary validation environment. Neutrality checks pass.
- **Risks:** No real agent discovery or human usability trial was claimed. Skills require installed commands and project facts; optional library generation and actual browser acceptance remain gated on evidence. No repository agent instructions were installed or overwritten.
- **Next:** I10 — versioned formats, migrations and portable token exchange


<a id="i10-completion-2026-10-21"></a>
### 2026-10-21 — I10: Versioned schema envelopes, explicit migrations and portable tokens

- **Resolved:** Persistent artifacts now have discoverable versioned schema envelopes and explicit migration/exchange paths instead of relying on implicit format assumptions.
- **Changed:** Added schema discovery, v1 project-config validation/migration preserving adapter blocks, explicit legacy token snapshot migration with ownership decisions, and bounded DTCG 2025.10 subset import/export preserving aliases, units, typography and supported color spaces. Unsupported features refuse rather than silently lose data; outputs are exclusive new files.
- **Validated:** pnpm check passes (541 tests), including nested aliases/cycles/type errors, composite typography, dimensions/colors and legacy snapshot migration. Portable subset tests rerun after budget tightening; six-package smoke passes.
- **Risks:** Schema envelopes complement runtime identity/hash/completeness validation. No full DTCG/resolver conformance or native Penpot import is claimed. Arithmetic, property references and unsupported units/color models remain outside the portable subset. No real project or design formats were migrated automatically.
- **Next:** F1 — concise docs paths and generated troubleshooting inventory


<a id="f1-completion-2026-10-21"></a>
### 2026-10-21 — F1: Concise documentation paths and generated troubleshooting

- **Resolved:** First-time readers now have a short quick start and clear person/agent/team/workflow paths, with repair guidance linked to the actual core error inventory.
- **Changed:** Replaced the long README with a six-command start and five-skill table; added cookbook, design workflow and adapter landing page, a guide map and generated troubleshooting. Updated request-root/envelope guidance and retained explicit pending clean-machine/illustrated checks in PLAN.
- **Validated:** pnpm check passes (543 tests). Local README/docs files and Markdown anchors resolve; generated troubleshooting exactly matches every core remedy. Core tests rerun after final navigation edits. No live UI claims were added.
- **Risks:** Owner-reviewed screenshots and a clean-machine human walkthrough remain pending. The error table covers stable core codes; config, interruption and unenumerated service domains are separately identified. Registry installs do not imply this unreleased branch is present.
- **Next:** F2 — web/project status and explicit file opening


<a id="f2-completion-2026-10-21"></a>
### 2026-10-21 — F2: Observed project health and pinned public file opening

- **Resolved:** Web and local projects now have a shared status view that separates connected facts from missing evidence, plus an explicit public file-opening command.
- **Changed:** Added project status with deployment/file/page/API, skill and baseline evidence; explicit trusted adapter status hooks and token declaration freshness; preserved local container diagnostics. Added encoded pinned URLs, print-only preview and honest platform-opener failure handling. Exposed read-only project status through MCP.
- **Validated:** pnpm check passes (547 tests) and six-package smoke passes. Tests cover foreign file refusal, adapter lines, explicit unknowns, encoded URL opening and failed opener diagnostics using stubs.
- **Risks:** No actual browser/login rendering or live status trial was claimed. Direct links may need deployment team context. Adapter hooks execute trusted code only with explicit opt-in; missing optional evidence keeps overall status incomplete.
- **Next:** F3 — configurable advisory audits with explicit unknowns


<a id="f3-completion-2026-10-21"></a>
### 2026-10-21 — F3: Configured advisory audits and explicit unknown evidence

- **Resolved:** Design review can now surface contrast, composition, target-size, naming and text signals without presenting inferred semantics or missing observations as compliance.
- **Changed:** Added validated audit settings, exact-ID suppressions/blank allowances, complete structured offline/live audit paths and bounded findings. Contrast requires same-revision resolved active colors plus matching opaque observed paints; library coverage reports unknowns; target sizes require explicit interactive IDs. Added documented assumptions and standards references.
- **Validated:** pnpm check passes (550 tests) and six-package smoke passes. Recorded-tree tests cover contrast ratios, mixed/alpha/foreign evidence, explicit target/blank signals, visible suppressions and truncation.
- **Risks:** Advisory signals only: no accessibility conformance, inferred clickability, browser CSS scale or general paint compositing guarantee. Overlaps, hidden ancestors and real input behavior require independent review. No live audit trial was performed.
- **Next:** C4 — advisory theme-family lint with reasoned suppressions


<a id="c4-completion-2026-10-21"></a>
### 2026-10-21 — C4: Advisory theme-family hue gaps

- **Resolved:** Projects can spot unchanged brand-family defaults after a primary-color change while retaining intentional contrasting brand choices.
- **Changed:** Added offline theme lint against installed defaults, circular hue-distance reporting, achromatic/non-literal unknowns and exact mode/token suppressions with reasons. Warnings remain visible and never write Penpot or fail on heuristic findings.
- **Validated:** pnpm check passes (552 tests) and six-package smoke passes. Fixtures cover green primary with unchanged blue siblings, intentional suppression and unchanged-theme silence.
- **Risks:** Hue is a limited heuristic rather than a brand/accessibility rule. Only declared literal opaque family colors are compared; actual Penpot resolution and browser appearance are separate evidence.
- **Next:** A4 — private credential files and OS credential references


<a id="a4-completion-2026-10-21"></a>
### 2026-10-21 — A4: Private file and OS credential references

- **Resolved:** Projects can resolve personal MCP credentials from private storage without copying them into repository connection files or exposing provider output.
- **Changed:** Added explicit private file/environment references and bounded fixed-argv macOS Keychain reads; no-cache connection resolution, fail-closed provider handling and known-key redaction. Connect reuses references without duplicating URLs. Doctor checks file permissions/history metadata and now fails readiness when no editor connection was observed. Added rotation guidance; arbitrary command providers remain explicitly deferred.
- **Validated:** pnpm check passes (559 tests) and six-package smoke passes. Tests cover rotation, permissions/symlink/size refusal, reference precedence, bounded Keychain argv, error secrecy, history metadata and non-green missing credentials. All credentials and OS reads were test doubles or temporary fake files.
- **Risks:** No personal store/key was accessed or changed. macOS access dialogs and actual provider compatibility remain untested; other platforms use private files and Windows ACL privacy requires owner management. History remediation/revocation remain owner actions.
- **Next:** G2 — owner-gated trusted publishing and release confirmation


<a id="g2-completion-2026-10-21"></a>
### 2026-10-21 — G2: Owner-gated trusted publishing and exact release confirmation

- **Resolved:** A reviewed release can use short-lived CI authentication/provenance without losing existing lockstep/package guards or silently publishing an unintended version.
- **Changed:** Added exact typed/noninteractive version confirmation, optional validated OIDC mode and a guard-then-pnpm-pack-then-npm-publish path with artifact hashes. Added manual main-only workflow, owner enable variable, protected environment and pinned action commits. Existing version/main/clean/pushed/registry/publish-order guards and local OTP path remain in force.
- **Validated:** pnpm check passes (563 tests), original release guards remain covered, and fake-command tests verify guard refusal and artifact-only provenance publishing. Workflow YAML/manual/protected boundaries validated offline; six-package smoke passes. No release command, workflow dispatch or remote policy mutation was run.
- **Risks:** Owner must configure/review GitHub environment protections and every npm trusted publisher/name before enabling. Actual OIDC exchange, registry provenance and blocked/new-name bootstrap remain pending; presence of an environment name alone does not prove protection.
- **Next:** H2 — evidence-qualified upstream requests for owner review


<a id="h2-completion-2026-10-21"></a>
### 2026-10-21 — H2: Evidence-qualified unsent upstream request draft

- **Resolved:** Upstream asks now distinguish observed source contracts and historical measurements, avoiding requests for capabilities that already exist.
- **Changed:** Added prioritized owner-review draft and reproducible 1.11.0 source-map inventory. Corrected optional StatTile trend support, existing StatCard child composition and consumer SidebarNav assumptions. Added the full branch review guide and retained all external send/adoption checkboxes unchecked.
- **Validated:** Final pnpm check passes (563 tests); six-package smoke passes; source inventory JSON, local links, release syntax and workflow boundaries validate. Consumer inspection was read-only and its pre-existing untracked penpot-poc folder remains unchanged. Nothing was sent upstream.
- **Risks:** No new live component measurement, browser accessibility reproduction or latest-upstream capability claim. Owner chooses requests/wording and any future send. G3, I12 and C1 live acceptance remain unchecked; C1 native generation remains deliberately gated.
- **Next:** Branch review — locally eligible work complete; live and owner gates pending

## Tracker history

- **2026-10-21 — Research baseline:** Claude's 28 proposals retained, 12 Codex additions included, and 40 items ordered into four delivery gates. Research validation is recorded in section 8.
- **2026-10-21 — Living tracker established:** Added delivery status, one-item workflow, completion/reporting rules, reopening rules and the per-item summary template. All 40 delivery items remain unchecked; I1 is queued first. No implementation started.

- **2026-10-21 — I1 completed:** Marked I1 verified, linked its resolution report, updated progress to 1/40 and queued A1. Repository PLAN.md, docs, skill and changelog updated alongside implementation.

- **2026-10-21 — A1 completed:** Guard the connected file. Progress 2/40; next A2 — stop ambiguous write retries.

- **2026-10-21 — A2 completed:** Stop ambiguous write retries. Progress 3/40; next I2 — require positive verification evidence.

- **2026-10-21 — I2 completed:** Require positive verification evidence. Progress 4/40; next G1 — transport fault tests and scratch smoke harness.

- **2026-10-21 — G1 completed:** Transport fault tests and scratch smoke harness. Progress 5/40; next I4 — capability-driven native API support.

- **2026-10-21 — I4 completed:** Capability-driven native API support. Progress 6/40; next G3 — hosted-file backup and restore proof.

- **2026-10-21 — G3 partial:** Backup candidate tooling and advisory notes tested; full restore proof and D3 remain pending. Count stays 6/40; next I3.

- **2026-10-21 — I3 completed:** Recoverable operations and checkpoints. Progress 7/40; next A3 — team onboarding, advisory coordination and stale-source checks.

- **2026-10-21 — A3 completed:** Team onboarding and advisory write coordination. Progress 8/40; next I5 — artifact provenance, consistent capture and atomic publication.

- **2026-10-21 — I5 completed:** Artifact provenance and consistent atomic publication. Progress 9/40; next I7 — stable command results, structured MCP envelopes and incomplete-output contracts.

- **2026-10-21 — I7 completed:** Versioned command results and interruption contracts. Progress 10/40; next I11 — lazy extension loading and explicit executable-code trust boundaries.

- **2026-10-21 — I11 completed:** Lazy executable extensions and explicit trust boundaries. Progress 11/40; next B5 — publish the dated, version-scoped build gotchas.

- **2026-10-21 — B5 completed:** Dated and version-scoped build gotchas. Progress 12/40; next E2 — owned-marker instruction integration with explicit destination and dry-run preview.

- **2026-10-21 — E2 completed:** Owned-marker instruction integration and preview. Progress 13/40; next B3 — unambiguous named exports, ad-hoc shots and option hints.

- **2026-10-21 — B3 completed:** Exact-name exports and complete ad-hoc shots. Progress 14/40; next B4 — integrate bounded layout settling into operations and exports.

- **2026-10-21 — B4 completed:** Bounded layout settling in normal write and capture paths. Progress 15/40; next I8 — structured, complete inspection with bounded payloads and revision-bound cursors.

- **2026-10-21 — I8 completed:** Structured inspection and measured transfer budgets. Progress 16/40; next C2 — project-owned extra sets and guarded token CRUD.

- **2026-10-21 — C2 completed:** Declared project extras and guarded token editing. Progress 17/40; next I6 — ownership conflicts and reference-aware destructive plans.

- **2026-10-21 — I6 completed:** Ownership conflicts and reference-aware reconciliation. Progress 18/40; next C3 — actual per-theme resolution and reliable selection restoration.

- **2026-10-21 — C3 completed:** Actual mode resolution and complete selection restoration. Progress 19/40; next B1 — guarded script-file execution with honest trust and verification outcomes.

- **2026-10-21 — B1 completed:** Reviewed plugin bodies from files. Progress 20/40; next B2 — neutral build kit and adapter-owned recipes.

- **2026-10-21 — B2 completed:** Neutral build kit and adapter-owned recipes. Progress 21/40; next I9 — explicit state, theme and responsive coverage.

- **2026-10-21 — I9 completed:** Explicit state, theme and responsive coverage. Progress 22/40; next H1 — scoped consumer follow-up proposal without cross-repository edits.

- **2026-10-21 — H1 completed:** Scoped Tradient follow-up proposal. Progress 23/40; next I12 — prepare and run measured human onboarding/collaboration trials.

### I12 preparation — 2026-10-21 (human acceptance pending)

- **Resolved:** Trial execution now has a repeatable runbook and explicit evidence template.
- **Changed:** Added benign wrong-file, controlled writer-contention and post-write recovery examples; unique ownership markers refuse unexplained existing objects.
- **Validated:** Offline actual-snippet tests cover contention and explicit recovery without duplicate objects; `pnpm check` passes (516 tests).
- **Risks:** No human results, live server exclusion, visual review or route adoption observed. Owner requested finishing branch code with live trials pending. I12 remains unchecked; progress stays 23/40.
- **Next:** C1 local component pilot tooling; native override proof and human adoption remain acceptance gates.

### C1 preparation — 2026-10-21 (live acceptance pending)

- **Resolved:** Component anatomy can be captured and compared without conflating source freshness, scalar equality and semantic binding.
- **Changed:** Added explicit six-context Button/Card/StatTile pilot, trusted optional renderer, bounded/hash-checked schema-1 snapshots, atomic publication, actual measurement/source-only check modes and Playwright fixture example. Native build explicitly refuses before override proof.
- **Validated:** `pnpm check` (519 tests) and `pnpm smoke:package` pass. Stub renderer tests cover anatomy drift, source invalidation, malformed evidence and preservation of old snapshots.
- **Risks:** No real component fixture or native override proof. Declared sources are not automatic transitive dependency tracking. No fabricated measured constants or native library. C1 remains unchecked; progress 23/40.
- **Next:** D1 structured handoff; live/human acceptance stays pending.

- **2026-10-21 — D1 completed:** Structured design handoff and offline freshness checks. Progress 24/40; next D4 — explicit implementation-case integration for Reflection.

- **2026-10-21 — D4 completed:** Explicit implementation cases and comparison evidence adapter. Progress 25/40; next E1 — typed MCP tools pinned to an explicit project root.

- **2026-10-21 — E1 completed:** Explicit-root typed stdio MCP services. Progress 26/40; next D2 — exact-artifact owner approval records.

- **2026-10-21 — D2 completed:** Exact-artifact owner words and explicit baseline waivers. Progress 27/40; next D3 — deterministic structural snapshots and review diffs.

- **2026-10-21 — D3 completed:** Deterministic page-split structural review snapshots. Progress 28/40; next E3 — focused recipes and handoff skills.

- **2026-10-21 — E3 completed:** Focused recipe and handoff skills. Progress 29/40; next I10 — versioned formats, migrations and portable token exchange.

- **2026-10-21 — I10 completed:** Versioned schema envelopes, explicit migrations and portable tokens. Progress 30/40; next F1 — concise docs paths and generated troubleshooting inventory.

- **2026-10-21 — F1 completed:** Concise documentation paths and generated troubleshooting. Progress 31/40; next F2 — web/project status and explicit file opening.

- **2026-10-21 — F2 completed:** Observed project health and pinned public file opening. Progress 32/40; next F3 — configurable advisory audits with explicit unknowns.

- **2026-10-21 — F3 completed:** Configured advisory audits and explicit unknown evidence. Progress 33/40; next C4 — advisory theme-family lint with reasoned suppressions.

- **2026-10-21 — C4 completed:** Advisory theme-family hue gaps. Progress 34/40; next A4 — private credential files and OS credential references.

- **2026-10-21 — A4 completed:** Private file and OS credential references. Progress 35/40; next G2 — owner-gated trusted publishing and release confirmation.

- **2026-10-21 — G2 completed:** Owner-gated trusted publishing and exact release confirmation. Progress 36/40; next H2 — evidence-qualified upstream requests for owner review.

- **2026-10-21 — H2 completed:** Evidence-qualified unsent upstream request draft. Progress 37/40; next Branch review — locally eligible work complete; live and owner gates pending.

## R1 — Release automation follow-up (2026-10-21)

- [x] Add one Changesets fixed group containing every package and reject omissions, duplicates, ignored packages or split groups.
- [x] Prepare one version PR containing package changelogs, the shared package version, CLI version constant and refreshed lockfile.
- [x] Require a new changeset for package/script PRs and reserve version bumps for the version PR; validate notes in CI.
- [x] Gate automatic publication on GitHub API evidence for the exact merged, same-repository version PR, then retain existing checks, dependency order and all-package registry verification.
- [x] Preserve explicit manual recovery; separate the GitHub PR token from npm OIDC and start both automation paths disabled.
- [x] Add activation instructions and a local [PR draft](pr-improvements.md).
- [ ] Owner: configure GitHub protections/PR token and every npm trusted publisher, verify package/name availability, inspect the generated version PR and activate publishing.

**Resolved:** Release notes and shared version changes no longer need to be assembled manually. Unchanged packages participate in the same version, and ordinary main merges do not publish.

**Changed:** Added Changesets 3.0.3, an explicit six-package fixed group, source-version/lockfile versioning wrapper, version-PR workflow and exact merged-PR publishing gate. Added CI release-note policy, gate/config/real-CLI tests, release documentation and the pending minor note for this improvement batch. This supersedes G2's manual-only workflow preparation while preserving manual dispatch/recovery.

**Validated:** `pnpm check` (579 tests), frozen-lockfile installation, six-package smoke installs, actionlint 1.7.12 on all three workflows, parsed workflow permission/gate tests, changed-document link checks and real Changesets CLI tests. A separate disposable full-wrapper rehearsal produced 0.2.0, six changelogs and the matching source constant; the actual branch remains 0.1.3. Automated tests use fake GitHub/OIDC evidence rather than real publication.

**Risks:** Remote branch/environment protections, PR-token permissions, npm trusted-publisher/bootstrap settings and the previously refused short name need owner verification. npm multi-package publication is sequential, not atomic; partial failures require explicit continuation. A moved main or ambiguous merge SHA fails closed. No push, merge, tag, real version bump, activation or publish was performed.

**Next:** Review the full improvement branch using [the review guide](branch-review.md), then authorize a push and draft PR when ready. Live G3/I12/C1 acceptance gates remain pending.

## R2 — Temporary short-name publishing exception (2026-10-22)

- [x] Add `PENPAIR_RELEASE_EXCLUDE_PENPAIR` as an explicit boolean that can omit only `penpair`, never an arbitrary package.
- [x] Keep all six packages in the version group; verify all five required packages and report the omitted wrapper in logs and the GitHub step summary.
- [x] Preserve partial-release guards and explicit continuation when restoring six-package publication.
- [ ] Owner: set the repository Actions variable to `true` while the short name is blocked, then remove/set `false` when ready to publish it.

**Resolved:** The blocked short name no longer prevents an explicitly configured five-package release, while repository versions remain in lockstep and unrelated publication failures remain fatal.

**Changed:** Added a boolean exclusion policy and dependency checks, mapped the repository variable into the protected publisher, and added visible exception reporting. This is the owner's requested narrow exception to R1's full-family publication requirement, not a package/version exclusion in Changesets.

**Validated:** Real release-entrypoint tests with local fake git/pnpm/npm commands verify the five-package result, no short-name registry access, refusal of partial required releases, explicit continuation and catch-up after removing the exception. `pnpm check` passes (582 tests), all six package smoke installs pass, and the workflow/config mapping remains tested. No real npm operation is performed by these tests.

**Risks:** Account setup and variable activation remain pending; npm publication is still sequential. The CI job succeeds for five verified packages only with the explicit exception and labels the family incomplete. Historical skipped wrapper versions are not automatically backfilled.

**Next:** Finish account settings, review the branch and create its PR when authorized.

## R3 — CI base references and release-PR validation (2026-10-22)

- [x] Validate feature release notes against the exact PR base SHA rather than assuming a local `main` branch exists.
- [x] Route consumed-note version PRs through the dedicated increased-version/lockstep verifier instead of requiring new notes.
- [x] Add main-only manual version-PR creation, still protected by the existing activation variable.
- [x] Reproduce detached/no-local-main and consumed-note cases with the real CLI, then pass the corrected paths.

**Resolved:** GitHub PR checkouts no longer fail solely because they lack local main, and generated version PRs are no longer rejected for having consumed their release notes. Enabling automation after merge no longer requires another commit to create the version PR.

**Changed:** The generic Changesets status step now runs only for feature PRs with the exact base SHA. Every PR still passes the dedicated release-note/version policy. Added `workflow_dispatch` to the version workflow with a main-branch guard and documented its use.

**Validated:** `pnpm check` passes (583 tests); all six package smoke installs and actionlint pass. The regression executes the actual workflow command in a detached temporary checkout with no main branch, proves missing notes still fail, and verifies a correctly versioned release PR after consuming its notes.

**Risks:** Live npm publication and live acceptance trials remain pending. This change does not enable release automation, merge the PR or publish anything.

**Next:** Push to PR #1 and confirm the GitHub check completes, including package smoke testing.
