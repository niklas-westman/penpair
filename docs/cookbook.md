# Cookbook

## Add a page

Confirm the target and active token vocabulary. Start with the [Hello-card example](../examples/hello-card/README.md), then compose reviewed project recipes through [the build kit](build-kit.md). Inspect/apply/read back, export twice and obtain owner review. Adapt the project naming convention for page/state/device; retain IDs and ownership markers for recovery.

## Update library tokens

Run the configured adapter's snapshot/check commands, review the declaration diff, then inspect live reconciliation before applying. The [token adapter guide](marwes.md) covers ownership/adoption conflicts and measured component limits. A stale snapshot or intentional designer edit requires a declaration/ownership decision rather than a blind overwrite.

## Onboard a colleague

Share config and the owner-authorized file pin through Git. Follow [team onboarding](team.md) with separate accounts/keys and write coordination. Doctor must observe the intended file. Localhost Docker instances are not automatically shared deployments.

## Rotate a key

Use the provider's own key-management UI and the private `connect --replace` flow. Reconnect the intended editor, run doctor and retain the same public file pin. Keep key values out of chat, command arguments, commits and reports. File/OS credential references are documented with their implemented provider support; avoid inventing external command helpers.

## Move to another Penpot

Obtain owner authorization, create an independent archive and prove a scratch import before changing the project target. Confirm all new public file/page/component IDs and update explicit mappings. Start a new evidence lineage; hashes/approvals from another file do not transfer just because frame names match.

## Recover interrupted work

Inspect the recorded run and the actual pinned objects; follow [recovery](recovery.md) with unchanged source/parameters and explicit resume. Preserve third-party edits. For disaster recovery use [backup/restore](backup.md), not a structural snapshot: the [review snapshot](snapshots.md) intentionally lacks full native fidelity.
