# Improvement branch review

Branch: `codex/penpair-improvements`. Review before merging. No push, merge, version bump, tag, publish, deployment, real Penpot mutation or upstream message was performed.

The [living checkbox document](improvements.md) contains the priority order and per-item **Resolved / Changed / Validated / Risks / Next** reports. It mirrors the owner's external brief. At handoff, 37 of 40 top-level items are implemented; the three live acceptance items below stay unchecked. Preparation substeps are checked separately.

## Review in this order

| Area | Main entry points and evidence |
| --- | --- |
| Target safety, execution and recovery | Config/file guards; one-shot ambiguous writes; positive readback; [journals/recovery](recovery.md); [team coordination](team.md) |
| Bounded inspection and artifact trust | [Inspection](inspection.md), [formats](formats.md), [snapshots](snapshots.md), [artifacts](artifacts.md), [approvals](approvals.md) |
| Page construction and token ownership | [Reviewed file scripts](run-file.md), [kit](build-kit.md), [token editing](token-editing.md), [adapter](marwes.md), [mode trials](mode-verification.md) |
| Implementation evidence | [Handoff](handoff.md), [case coverage](coverage.md), [explicit provider adapter](../packages/reflection-check/README.md) |
| Agent and operator paths | Five shipped skills; [MCP](mcp.md), [credentials](credentials.md), [status/open](status.md), [advisory audits](audits.md), [troubleshooting](troubleshooting.md) |
| Release/consumer/upstream preparation | [Release gates](releasing.md), [consumer proposal](tradient-followups.md), [unsent upstream requests](upstream/marwes-requests.md) |

Commits are grouped by backlog item. Inspect one item/report and its commit before moving to another. Tests use actual generated plugin bodies where possible, fake transports/servers, recorded structures and temporary consumers. The package smoke installs all six tarballs in clean consumers; it does not publish them.

## Intentionally open acceptance gates

- [ ] **G3:** Owner-authorized hosted `.penpot` export/import and full token/component/asset/render restore comparison. Archive candidates and structural review data do not prove restore fidelity.
- [ ] **I12:** Two real people complete onboarding, wrong-file prevention, writer conflict, recovery and one real design-to-code route. Use the [runbook/template](trials.md); no synthetic people or timings are recorded as results.
- [ ] **C1:** Real Button/Card/StatTile fixture measurements and pinned-native-API proof that instance text/style overrides survive updates. Measurement/drift tooling is built; native library generation deliberately refuses until that proof exists. Measured project constants are not fabricated.

The owner requested finishing branch code and leaving live trials pending. Those unresolved gates remain visible rather than being counted as delivered behavior. Native generation depends on that live proof and is the material remaining implementation gate.

## Decisions to assess before adoption

- Read declarations and trusted project modules are contracts, not execution sandboxes. Default built-in inspection avoids extension imports; explicit adapter/provider/registered-script paths execute trusted code.
- Shared writer markers are advisory across machines. Journals preserve uncertainty and support explicit reconciliation; they are not transactions, rollback or exactly-once execution.
- Typed handoff/mapping hints preserve literal design data. They do not infer application state, component semantics, responsive behavior or accessibility from pixels.
- Rich comparison cases need actual project setup and independent browser readback. Pixel ratios, size signals and heuristic hue findings remain evidence for review.
- Changed baseline references require exact owner-word evidence or a visible forced-reference waiver; waived references do not satisfy approved rich coverage.
- The project MCP server has an immutable explicit root/target, strict file guards and bounded responses. Registered writes require server opt-in and call-level apply. Cancellation remains cooperative for trusted code.
- Private file/Keychain providers are implemented, but no real personal store was exercised. General credential commands remain deferred.
- The release workflow requires owner activation, protected-environment policy and npm publisher settings. No remote policy or actual OIDC/provenance result has been established. All packages remain 0.1.3; the branch is unreleased.
- Consumer changes and upstream sends remain owner actions. Existing optional trend/Card composition and the consumer SidebarNav corrected parts of the original brief; historical measurements remain version/context-scoped.

## Release automation follow-up

R1 adds Changesets version PRs with one fixed group for all six packages and an
API-verified exact merged-PR gate before publishing. Ordinary feature merges do
not publish. The PR token has no npm role; publishing uses OIDC and retains the
existing release guards. Both paths start disabled. Review the [activation
checklist](releasing.md#one-time-owner-activation) and [local PR draft](pr-improvements.md).
The pending minor note proposes 0.2.0; actual package versions remain 0.1.3.

## Validation and handoff

Final verification covers `pnpm check`, `pnpm smoke:package`, docs/anchor and generated-remedy checks, targeted skill-entrypoint validation, release helper syntax and workflow YAML boundaries. The final recorded suite has 579 tests across core, adapter, implementation bridge and Docker. The final full branch check and six-package smoke both passed before handoff. Live/editor/browser/human acceptance remains pending as listed above.

Review this branch locally against main. External authorization is needed before any push, merge, release activation, publishing, version bump, consumer write or non-scratch Penpot change. No new confirmation is needed for the already authorized local implementation work.
