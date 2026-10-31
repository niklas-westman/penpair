# skills

## Overview

Legacy ground, kept for links rather than for use. The skills the project
actually ships live in `packages/core/skills` and are installed from there by
`penpair skills install`; this tree holds one superseded folder that redirects to
the canonical setup skill, plus the reference snippet attached to it.

Treat this directory as closed: a new skill belongs in `packages/core/skills`,
where the installer, the skill tests and the neutral-core rule all apply.

## Subdirectories & Boundaries

- **penpair-setup-guide**:
  [./penpair-setup-guide/EGM.md](./penpair-setup-guide/EGM.md) — the redirect to
  `packages/core/skills/penpair-setup`, and a copy-me proof-of-concept snippet.

## Global Invariants

- **Nothing here is installable.** The installer reads `packages/core/skills`
  only, so a reader who follows an old link is sent onward rather than given a
  second, divergent copy.
- **Nothing here is imported or executed** by any package, script, test or
  example in this repository.
- **It is still gated as code.** The directory holds a `.mjs` snippet, so
  `skills/` is one of the roots `scripts/check-code-paths.mjs` scans for
  kebab-case paths — and it is in scope for this repository's architectural
  contracts, which is why these files exist.
- The neutral-core rule does not reach here: `packages/core/test/neutrality.test.ts`
  scans `packages/core/src` and `packages/core/skills`, not this tree. A snippet
  here may therefore name a project or component library, and the one that exists
  deliberately does not.

## Global Side Effects

- None in this repository. The only effects are those an adopter causes by
  copying the reference snippet into their own project and running it against
  their Penpot file.

## System Verification

- `pnpm check:style` (`scripts/check-code-paths.mjs`) gates path naming; `pnpm conventions:check` only unit-tests `findInvalidCodeDirectories` against fixture strings.
- `pnpm test` in `packages/core` — covers the canonical skills in
  `packages/core/skills`, not this tree.
