# Codex skill workflow readiness

Created and last updated: 2026-10-23. Branch: `codex/skill-workflow-readiness`.
Status: implementing. Current step: S5.

## Living document

Check an item only in the change that implements and verifies it. Commit each
completed step before proceeding. Add a completion entry stating what changed,
what it resolved, verification and remaining limits. Record newly discovered work
and keep live acceptance unchecked until it actually runs.

## Objective and evidence

Make Penpair's skills easier for Codex to select and follow when working with
Penpot designs, approved references and frontend comparison. Tradient's 0.3.0
trial showed that skills were loaded but their design guidance was underapplied.
Discovery, visible selection, evidence quality and human acceptance are separate.

The installed skills are valid in `.agents/skills`; relative symlinks work.
Codex selects implicitly from descriptions; optional `agents/openai.yaml` is not
a prerequisite. Official reference: [Codex skills](https://developers.openai.com/codex/skills/).

## Discovered project context

| Area | Existing implementation / validation |
| --- | --- |
| Workspace | pnpm 10.12.1, six packages under `packages/`, all at 0.3.0 |
| Skill sources | `packages/core/skills/` |
| Installation / instructions | `packages/core/src/skills.ts`, `skill-instructions.ts` |
| CLI | `packages/core/src/cli-main.ts`; versioned result envelopes |
| Tests | Vitest; `packages/core/test/skills.test.ts`, `skill-instructions.test.ts` |
| Style / full check | `pnpm format`, `pnpm check` |
| Packaging | `pnpm smoke:package`; installs real tarballs in empty projects |
| CI | `.github/workflows/ci.yml`, full check plus package smoke |

## Boundaries

- Neutral core and shipped skills; project/library knowledge stays in adapters
  and consumer-owned facts. Preserve public imports and approval schemas.
- Preserve owner instructions outside the installer-owned block, partial skill
  installs, modified skill files and project-owned facts.
- Skill selection grants no extra write permission. Preserve pinned targets,
  positive independent readback, immutable approved baselines and owner approval.
- Diagnostics are offline and read-only. They cannot prove what a Codex session
  loaded, predict its selection, inspect credentials or certify design quality.
- No version bumps, publication, push, merge or live Penpot writes in this work.
- Writer-marker recovery, repeated archive flags, bounded state-variant runtime
  operations and performance instrumentation remain separate feedback work.

## Checklist and acceptance

- [x] **S1 · Route tasks from generated instructions (P1).** Add concise,
  actionable task-to-skill routing inside the owned instruction block. Include
  only installed/selected skills, preserve custom text and relative links, and
  load the applicable skill before tool work. Verify partial installs, nested
  destinations, dry-run, repeated updates and existing preservation tests.
- [x] **S2 · Improve skill selection descriptions (P1).** Use ordinary Penpot,
  approved-design, state-variant and frontend requests with clear boundaries.
  Validate frontmatter, names, packaged references and neutral content. Do not
  claim that metadata validation proves model behavior.
- [x] **S3 · Ship a focused verification skill (P1).** Add `penpair-verify` for
  real frontend comparison, screenshot inspection, bounded fixes and reruns.
  Route from design/handoff and retain separate readiness/approval stages. Fix
  contradictory starter guidance. Verify installation and package enumeration.
- [x] **S4 · Record comparative evidence before expansion (P1).** Add a reusable
  project-owned checkpoint format and skill workflow for source evidence,
  preserved/changed regions, a representative candidate, consequential findings,
  next action and review status. Missing evidence must remain pending. Whole-page
  pixel equality is unsuitable for intentionally different states. Verify the
  example, reference paths and reuse through the installed skill pack.
- [ ] **S5 · Diagnose discovery and exercise realistic requests (P2).** Add
  read-only `skills check` diagnostics for discoverable files, metadata, links
  and project routing, with explicit limits. Cover missing, malformed, dangling,
  divergent and disabled implicit invocation cases. Supply a reproducible prompt
  trial matrix and record actual results separately from unevaluated fresh-model
  trials. Test CLI results and ensure no connection/adapter execution or writes.
- [ ] **S6 · Make selected skills visible and finish review (P2).** Add useful
  Codex display metadata/example prompts and a concise selection announcement.
  Keep implicit invocation enabled. Validate metadata and installed copies; run
  full checks and all package smoke installs. Record final results and limits.

## Validation and failure protocol

For each step, run the relevant existing tests plus meaningful regressions for
changed runtime behavior. Run `pnpm format` and `pnpm check` before committing
implementation. Run package smoke for the new skill and final package boundary.
Docs/metadata checks validate syntax, resources and preservation; they do not
substitute for observing a model handling a real request.

If a check fails, repair that step before checking its box. If live evidence or
an owner decision is unavailable, preserve the pending item and continue only
independent authorized work. Do not weaken guards or simulate owner approval.

## Live acceptance

- [ ] Fresh Codex sessions: ordinary requests select the appropriate installed
  skill and produce the required artifacts; record the actual loaded files.
- [ ] A representative approved-reference variant is visually critiqued before
  expansion; owner reviews the result in a disposable authorized Penpot file.
- [ ] A consumer's implemented route completes real Reflection comparison with
  approved references and independently observed browser state.

Live trials remain pending by owner instruction. No extra agents or API-backed
evaluation will be started without the required authorization.

## Completion reports

- **S4 completed · 2026-10-23.** Added a shared visual checkpoint template and
  source/candidate review procedure, routed through design, recipes, handoff and
  verification. It records preserved regions and intended changes, actual images,
  consequential findings, readiness and next action. Missing evidence blocks
  expansion in the skill workflow; no runtime command claims to measure taste or
  attest that an image was seen. Full checks pass (665 package tests + 3 convention
  tests), packaged links resolve, and a disposable install proved that a copied
  project-owned checkpoint survives forced skill refresh. Live critique remains
  pending.

- **S3 completed · 2026-10-23.** Shipped `penpair-verify` as the sixth consumer
  skill, with ordinary parity/fix triggers and design/handoff routing. It records
  actual browser readiness, inspects images and recaptures scoped fixes without
  changing references or granting approval. Corrected both stale claims that the
  browser starter was still planned. Full checks pass (665 package tests + 3
  convention tests); all six package smoke installs pass and the installed Codex
  link resolves the new skill. Consumer browser/owner acceptance remains pending.

- **S2 completed · 2026-10-23.** Front-loaded everyday task descriptions now
  distinguish design operations, state construction, design judgment and frontend
  implementation. Replaced the installer's line regex with bounded YAML data
  parsing so quoted/folded descriptions work and malformed or mismatched metadata
  fails clearly. Reused the workspace's pinned YAML version as a core dependency.
  Full checks pass: 665 package tests plus 3 convention tests, including 9 metadata
  and packaged-resource checks. No fresh-model selection claim is made.

- **S1 completed · 2026-10-23.** Generated instructions now route matching tasks
  to selected skills before tool work instead of presenting only a directory.
  Partial installs emit no routes to unselected skills; nested encoded links
  resolve, repeat installation is unchanged and owner text is preserved. Full
  `pnpm check` passes: 656 package tests plus 3 convention tests. Selection and
  correct application by a fresh model remain live acceptance, not a claim of
  the installer.

- **Plan prepared · 2026-10-23.** Created the branch from merged main and mapped
  all six proposed improvements to acceptance criteria and verification. The
  prior release cleanup is merged and its continuation workflow succeeded;
  package versions remain 0.3.0. No skill implementation has been checked off.
