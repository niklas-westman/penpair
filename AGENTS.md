# Agent instructions

## Project plan

Read `PLAN.md` first in every session. It is the living checklist: what the product is, what is done, what is "Now", what is next, and what is undecided.

- Check a box in the same change that finishes the work, and add a line to its change log. A box is checked only when the step is built and verified.
- Keep exactly one item as "Now". New work goes into the area it belongs to as an unchecked box.
- Push, tag, publish, version bumps, deploys and any write to a Penpot instance other than a scratch one need the owner's go-ahead. Local commits of verified steps do not, once the owner has asked for commits.

## Rules that do not bend

- **Neutral core.** `packages/core` never names a project or a component library. A test fails the build if it does. Project knowledge goes in adapters, in the adopting project, or in the examples.
- **No secrets in the repository, in output or in logs.** The MCP URL carries a personal key: redact it, never print it, never commit it.
- **Write protocol for any Penpot change:** read-only inspect, a pinned snapshot, one idempotent write, an independent readback, an export that is looked at. A first export after a write or a page switch can be stale; look twice.
- **Snippets sent to Penpot stay under 90 KB** (the proxy refuses about 110 KB).
- Pin the Penpot version; run the smoke test before bumping it.

## Packages

`@penpair/core` (`packages/core`: library, the `penpair` command, skills, both ways of running Penpot) and `penpair` (`packages/penpair`: only the short name for `npx penpair`). Same version, always. The Docker code lives in `packages/core/src/docker` and nothing the connection or the library needs may import it (a test enforces it), so it can move to `@penpair/docker` later. Publishing is the owner's act; the steps are in `docs/releasing.md`.

## Validation

`pnpm check` runs the typecheck, the tests and the build. `pnpm smoke:package` packs both packages, installs them in an empty project and runs them; run it before any release.
