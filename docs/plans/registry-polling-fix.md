# Registry visibility polling — 2026-10-22

Branch: `codex/release-registry-polling`. Base: reviewed 0.3.0 release on main,
`4ea9975`. Repository package versions remain 0.3.0.

## Failure and evidence

The [publish job](https://github.com/niklas-westman/penpair/actions/runs/39801876697/job/119904592523)
accepted `@penpair/core@0.3.0` at 15:17:02 UTC with signed provenance. npm explicitly
reported that processing could take a few minutes. The script exhausted twelve
five-second visibility checks and stopped at 15:18:05 UTC. No subsequent package
was published by that run.

An independent registry check then found core 0.3.0 visible, with Docker, the token
adapter, the comparison adapter and web still absent. This establishes a
processing-delay failure after an accepted upload; increasing a publish timeout
or retrying the upload is unnecessary.

## Completed checklist

- [x] Extract a focused post-publish visibility helper. It checks immediately and
  then at minute intervals within a ten-minute deadline for each uploaded package.
- [x] Count registry query time toward the deadline and report elapsed time and
  the next check/deadline in workflow logs.
- [x] Bound each npm metadata process and HTTP request to 30 seconds or the
  remaining deadline, with hidden npm retries disabled.
- [x] Retain errors for failed lookups, explicit interrupted-release continuation,
  dependency-order publishing and the configured short-name exception. The
  visibility helper never uploads a package.
- [x] Add virtual-clock tests for immediate/delayed visibility, exact minute
  cadence, query duration, ten-minute expiry, remaining query budget, late
  observations and registry errors. Query-boundary tests cover 404, authentication,
  network errors and killed processes without touching npm.
- [x] Document recovery and the order of operations before merging a tooling fix.

## Validation

- `pnpm check`: **658 tests** pass, including 15 new polling/query tests, along
  with builds, typechecks, style/path checks and the six-package version guard.
- `pnpm smoke:package`: all six tarballs install and run.
- Final polling/logging tests pass independently using virtual time. No real
  ten-minute sleeps or npm publication were used for testing.
- `git diff --check` passes. The empty Changeset records repository tooling work
  and does not propose a package version bump.

## Current release recovery and remaining risk

- [ ] On current `main`, dispatch **Publish reviewed Penpair release** with
  `version=0.3.0` and `continue_release=true`, then approve `npm-release`.
- [ ] Verify all five required scoped versions and provenance. The `penpair`
  wrapper remains explicitly excluded.
- [x] Polling fix merged as PR #5 before recovery completed; the early-merge recovery below supersedes the original merge order.

The current main workflow still has its original one-minute visibility wait. If
another accepted upload exceeds it, inspect the registry and explicitly continue
the same version again. Rerunning the failed push workflow does not select
continuation automatically.

Finish recovery before merging this branch: its pending Changeset would block the
manual release gate on main. This preserves the existing guard rather than
changing it to accommodate an interrupted release. Ten minutes is a bounded
window, not a guarantee that npm finishes processing; a failed lookup or an
expired deadline still stops for inspection.

## Early merge recovery

PR #5 was merged on 2026-10-22 as `d339a19` while the 0.3.0 release remained
interrupted. The new minute polling is now on main. The remaining pending note
`bounded-registry-polling` has an empty release list and requests no version bump.
The version-PR workflow therefore created no release PR. Manual continuation is
blocked until that metadata has been consumed.

The post-merge push workflow separately hit a GitHub API HTTP 500 while reading
associated PRs; its publish job was skipped. That API error is distinct from the
pending-note check. Manual dispatch uses the explicit-version path.

- [x] Reproduce Changesets' consumption in an isolated workspace: only the empty
  note is removed and every package stays at 0.3.0.
- [x] Use the same Changesets CLI operation on the cleanup branch. Confirm no
  package manifest, source version, lockfile, script or workflow changes.
- [x] Run the unchanged `checkReleaseCommit` and manual workflow gate against the
  resulting tree: both accept 0.3.0 with no pending notes. No publish command runs.
- [x] Pass style/path checks and 47 existing Changesets, release-guard, polling,
  registry-query and documentation tests. The cleanup changes only metadata/docs;
  the previous 658-test run and six-package smoke cover the retained polling code.
- [ ] Review/merge the metadata-only cleanup PR and pass its CI.
- [ ] On the resulting main, dispatch **Publish reviewed Penpair release** with
  `version=0.3.0`, `continue_release=true`, and approve `npm-release`.
- [ ] Verify all five scoped packages and their provenance before marking the
  release complete; the short-name exception remains enabled.

The consumed tooling note is preserved here:

> Allow npm processing time after successful uploads: check visibility immediately
> and then once per minute within a ten-minute deadline per package. Bound metadata
> queries and retain explicit recovery for interrupted releases. This changes
> repository release tooling only.

This cleanup completes an empty metadata item through Changesets. Package release
notes and release guards remain intact; the interrupted version remains 0.3.0,
with core skipped by explicit continuation once independently observed on npm.
