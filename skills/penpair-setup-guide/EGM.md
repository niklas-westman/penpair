# penpair-setup-guide

## Overview

A redirect document kept for existing links, plus one reference snippet. This is
**not** an installable skill of its own: the canonical setup skill is
`packages/core/skills/penpair-setup/SKILL.md`, and the installer ships only that
one. `SKILL.md` here exists so an old URL still leads a reader to the right
place.

## Subdirectories & Boundaries

- **references**: [./references/EGM.md](./references/EGM.md) — a copy-me project
  snippet for a first proof of concept. Not imported or executed by this
  repository.

## Interface

- `SKILL.md` — the redirect. It names the canonical skill, says what that skill
  covers (first installation, assisted and manual routes, connection repair for
  Claude Code, GitHub Copilot and Codex), and tells a reader who already has this
  old folder installed to preview a skill refresh and review its legacy-folder
  report before removing anything.

## Invariants

- **It must stay a redirect.** Adding installable content here would give the
  project two setup skills that can disagree, which is the failure it exists to
  prevent.
- **It is not what the installer ships.** `penpair skills install` installs from
  `packages/core/skills`; this folder is reached by an old link. Separately, the
  core detects and reports installed copies of a `penpair-setup-guide` folder in
  the project skill folders (`skills.ts`, `skill-check.ts`,
  [docs/skill-installation.md](../../docs/skill-installation.md)); that is the
  legacy-folder report `SKILL.md` refers to.
- **Removal advice stays conservative:** preview a refresh, read the
  legacy-folder report, preserve customizations. An agent must not delete a
  project's installed folder on this document's word.
- The canonical target is referenced by absolute URL, because a reader arriving
  from an old link may not have the repository.

## Side Effects

- None. Both files are read; neither is imported, executed or installed from
  here.

## Verification

- `pnpm test` in `packages/core` covers skill discovery and installation for the
  canonical skills under `packages/core/skills`; this folder is outside that set
  by design. Tests in `skill-check.test.ts` and `skills.test.ts` also cover the
  legacy-folder report for installed `penpair-setup-guide` copies, without reading
  this folder.
- `pnpm check:style` (`scripts/check-code-paths.mjs`) gates the path naming; `pnpm conventions:check` only unit-tests the function against fixture strings.
