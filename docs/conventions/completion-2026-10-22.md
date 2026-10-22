# Readability conventions completion — 2026-10-22

Branch: `codex/tradient-feedback`. All repository package versions remain 0.2.0.

## Completed checklist and what each update resolves

- [x] **Readable formatting baseline.** Pin Biome 2.6.2, use two-space indentation
  and expanded layouts, add braces and separate variable declarations. This
  removes compressed source layouts and makes subsequent diffs consistent. The
  mechanical baseline is its own commit, `b1a9445`, for review.
- [x] **Maintained conventions.** Add task-based guidance for naming, package
  ownership, module extraction, TypeScript, tests and sandbox code. This gives new
  work a concrete placement and implementation pattern instead of relying on
  memory or copying unrelated frontend conventions.
- [x] **Checked examples.** Typecheck actual core contracts and run helper,
  sandbox-generation and path-rule tests. This catches stale examples and proves
  that the generated plugin body compiles and behaves as documented.
- [x] **Agent discovery.** Link the conventions and repository-local
  `penpair-code-conventions` skill from `AGENTS.md`, with contributor routing from
  `CONTRIBUTING.md`. This makes readable names and early responsibility extraction
  part of the implementation workflow.
- [x] **Continuous enforcement.** Include Biome, directory naming and example
  validation in `pnpm check`, which existing CI already runs. The CI job name stays
  stable for branch protection. These checks prevent automatic style/path drift;
  review still judges the meaning of names and module boundaries.
- [x] **Comparison adapter extraction.** Replace the dense entrypoint with focused
  public contracts, planning, capture validation, provider validation, PNG I/O,
  orchestration and command modules. Public imports, report fields, approval gates
  and command behavior remain compatible. Shared test fixtures and capture tests
  also have focused files.
- [x] **Installed contract verification.** Extend package smoke testing to import
  the packed adapter's public functions/default export and typecheck its public
  contracts. This catches missing extracted files or broken declaration exports.

## Validation

- `pnpm check` passes: **640 package tests plus 3 convention tests**, style/path
  checks, builds, typechecks and the six-package version guard.
- `pnpm smoke:package` passes for all **six tarballs**, including the new runtime
  export and declaration checks.
- The comparison package's tests/helpers also pass a separate strict TypeScript
  check. Skill YAML metadata, UI metadata and local convention/skill links resolve.
- Before the manual extraction, an AST comparison across 199 changed
  JavaScript/TypeScript files found no differences beyond formatting, equivalent
  control-flow blocks and separate declarations. The initial formatted baseline
  passed all 630 pre-existing tests.
- `git diff --check` passes. A patch Changeset records the delivered refactor and
  documentation. No version bump, push, publication or live Penpot write occurred.

## Limits

Biome cannot determine whether a name expresses the right domain meaning or when
responsibilities deserve separate modules; the skill and review cover those
decisions. Raw async plugin bodies, JavaScript inside strings, generated artifacts
and captured fixtures retain the handling described in the [conventions index](README.md).
This update does not constitute new live Penpot or browser acceptance. The
[existing pending acceptance](../plans/tradient-feedback-review.md#remaining-acceptance)
stays open.
