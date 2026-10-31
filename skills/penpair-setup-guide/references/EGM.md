# references

## Overview

One reference attached to the legacy setup guide: a starting-point project
snippet for a first proof of concept. It is a template to copy into an adopting
project, not code this repository runs or imports. Nothing in `packages/` or
`scripts/` references it, and no test executes it.

## Interface

- `poc-snippet.mjs` — a project snippet body intended to be copied to, for
  example, `snippets/poc-sign-in.mjs` in the adopting project, listed under
  `snippets` in that project's `penpair.config.json`, and run with
  `npx penpair run poc-sign-in` (inspect only) or `--apply` (write once, then
  read back). It adds a small token set, a sign-in board and a button component
  to the open page.
- No exports. The file is a snippet definition for the project's registry, not a
  module this repository loads.

## Invariants

- **It is a copy-me template.** The path a reader is told to use is in the
  adopting project; editing this file changes the example, not any shipped
  behaviour.
- **Everything it creates is prefixed `POC` (tokens are named `poc-color-*`),** so an adopter can find and remove
  the result. Re-running leaves whatever already exists alone, which is the
  idempotence the write protocol requires of any write snippet.
- **It stays inside calls proven against the pinned Penpot version** — boards,
  flex layout, text, a token set, a component. Binding a *value* to a token is
  deliberately left out and routed to the `penpair-design` skill, because that
  path has its own traps.
- **It is a project snippet, so the core validates it before running it.** A body
  that cannot parse, or that breaks the 90 KB snippet limit, is refused before
  the connection opens rather than failing inside the editor.
- Directory and file names stay kebab-case; `skills/` is one of the roots
  `scripts/check-code-paths.mjs` gates.

## Side Effects

- None in this repository: the file is read by people, never imported or
  executed here.
- When an adopter copies and runs it with `--apply`, it mutates their Penpot file
  — creating a token set, a button component and a sign-in board with two field
  boards, on the already open page `penpair POC` — and must be
  aimed at a file whose owner has agreed to the change.

## Verification

- `pnpm check:style` (`scripts/check-code-paths.mjs`) gates this directory's path
  naming; `pnpm conventions:check` only unit-tests `findInvalidCodeDirectories`
  against fixture strings.
- No test executes the snippet. Verifying it means copying it into a project and
  running `npx penpair run` against an authorised scratch file.
