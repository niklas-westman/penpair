# Validate a source build and project workflow

Use automated checks for code/package contracts, an authorized scratch file for
live Penpot behavior, and the actual application for frontend comparison. Passing
one layer does not establish the others. Record versions and observations rather
than treating a report template or an unrun checklist as evidence.

## Source and package checks

From the repository root:

```sh
pnpm check
pnpm smoke:package
```

The first command checks formatting, code paths, build, types, convention
examples, tests and shared package versions. The package smoke packs all six
packages, installs them into empty projects and exercises their public commands
and contracts. It does not publish packages or connect to a live Penpot file.

For a separate unreleased consumer trial, install the complete matching tarball
set. Override transitive `@penpair/core` resolution to that same packed core, as
`scripts/smoke-package.mjs` does. Installing only a command tarball can otherwise
resolve a different core from npm. Install one command package, plus only the
adapters the project actually uses.

## Scratch Penpot checks

The owner must authorize a disposable target and identify its file/page IDs.
Keep its editor and plugin visible, pin the intended file and enter personal
credentials only through the private connection flow. Never infer scratch
authorization from a file name.

- Run onboarding and `doctor --json`; retain actual target/version evidence.
- Inspect and build one representative case with the [Hello-card example](../examples/hello-card/README.md)
  or the tagged scratch probe described in [compatibility](compatibility.md#automated-checks-and-manual-scratch-smoke).
- Exercise wrong-file refusal, advisory writer coordination and interrupted-run
  recovery only on the authorized scratch target. Reusable scripts are under
  `examples/trials/`; follow [recovery](recovery.md) and [team coordination](team.md).
- Inspect independent readback, export until stable and look at the images.
  Remove only confirmed owned objects or discard the disposable file. A lost
  response is not permission to replay a write.

For multi-person checks, use separate project folders and independently owned
credentials. A same-checkout lock test cannot establish cross-client atomic
exclusion. Shared writer markers remain advisory.

## Skills, implementation and recovery evidence

Use [skill validation](skill-validation.md) to distinguish valid discovery from
actual skill selection and correct application. For frontend work, configure the
[comparison companion](adapters.md#check-the-frontend-against-the-design) with
approved references, real state setup/readback and a real browser provider.
Inspect reference and actual images; keep pixel metrics, visual findings,
behavior/accessibility checks and owner acceptance separate.

Prove backup restoration with the [scratch export/import checklist](backup.md#prove-the-restore-on-scratch).
Structural JSON snapshots do not establish full archive fidelity. Native
component generation requires its own instance-override preservation proof;
see the [component pilot](marwes-components.md).

Record the tested commit/tarball hashes, package/runtime/browser versions, public
target IDs, exact cases, actual observations, interruptions and unresolved
findings. Leave unobserved metrics unknown. Keep internal checklists, session
reports and private evidence in git-ignored `.working-docs/`; promote lasting
behavior and compatibility findings into maintained guides. Never retain keys,
private connection URLs or secret-entry screenshots in review artifacts.
