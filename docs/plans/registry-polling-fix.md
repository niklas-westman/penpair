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
- [ ] After recovery completes, review and merge the polling fix.

The current main workflow still has its original one-minute visibility wait. If
another accepted upload exceeds it, inspect the registry and explicitly continue
the same version again. Rerunning the failed push workflow does not select
continuation automatically.

Finish recovery before merging this branch: its pending Changeset would block the
manual release gate on main. This preserves the existing guard rather than
changing it to accommodate an interrupted release. Ten minutes is a bounded
window, not a guarantee that npm finishes processing; a failed lookup or an
expired deadline still stops for inspection.
