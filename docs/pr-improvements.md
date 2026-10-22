# PR draft

Target: `main` ← `codex/penpair-improvements`

Title: **Add guarded design workflows and reviewed whole-family releases**

## Description

Penpot operations now pin the target file, stop ambiguous write retries, require
positive readback evidence and record recovery progress. Structured inspection,
token ownership/reconciliation, explicit design cases, approvals, snapshots and
implementation handoffs make design-to-code work reproducible and reviewable.

The branch also adds project MCP tools, reusable build recipes, focused agent
skills, private credential references, advisory audits and clearer documentation.
The neutral core and one-way package dependency rules remain enforced.

Releases now use Changesets to collect notes into one **Release Penpair** PR. All
six packages receive the same bump, including unchanged packages. Merging that
reviewed version PR can trigger the existing guarded whole-family publisher using
npm OIDC. Feature merges only collect notes. The owner-approved temporary
`PENPAIR_RELEASE_EXCLUDE_PENPAIR=true` repository variable can omit only the
blocked short-name wrapper from publishing, with explicit logs/summary and all
other packages still required. All six repository versions continue together. A separate GitHub PR token is needed
for automatic version-PR checks. Both automation paths remain disabled until
owner activation; no package version is changed by this PR. The pending note
proposes 0.2.0 in the separate generated version PR.

## Validation

- `pnpm check`: build, typecheck, 582 tests and lockstep/config checks.
- `pnpm smoke:package`: all six tarballs install and run in clean consumers.
- Real Changesets CLI tests verify unchanged-package bumps, highest-level
  selection, changelogs, note consumption and exact workspace dependencies.
- A disposable full version-wrapper rehearsal moves every package, changelog and
  the source constant to 0.2.0; this branch remains at 0.1.3.
- All three workflows pass actionlint 1.7.12 and parsed permission/gate checks.
- Gate tests cover ordinary pushes, exact merged version PRs, manual confirmation,
  pending notes, malformed auth evidence and workflow permission separation.

## Open acceptance and activation

- Hosted export/import restore proof (G3), two-person live trials (I12), and
  real component measurement/override proof (C1) remain unchecked by request.
  Native component generation remains gated.
- Configure GitHub main/environment protection, the PR token and trusted
  publishers for every npm package before enabling release automation. Verify
  the previously refused short name and any unpublished package bootstrap.
- npm publication is sequential; partial failures require explicit recovery.
- No remote policy, live Penpot mutation, consumer edit, upstream message,
  release, tag or deployment was performed.

Review details: [branch review](branch-review.md), [living checklist and
reports](improvements.md), [release activation](releasing.md#one-time-owner-activation).
