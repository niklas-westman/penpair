# Tradient adoption proposal — owner review required

This is a scoped handoff, not an applied consumer change. Read-only inspection on 2026-10-21 found local `main` at `3aa7a1c` in `/Users/niklaswestman/Documents/tradient/CODE/tradient`. The pre-existing untracked `penpot-poc/` folder remains untouched. No consumer files, commits, configuration, Penpot data or deployment state were changed.

## Evidence and corrections

- Root dev dependencies pin `@penpair/web` and `@penpair/marwes-ui` to `0.1.3`; the primary UI uses `@marwes-ui/react` `^1.11.0`.
- Root package scripts contain no `design:*` entries. `.env.example` has no `PENPAIR_MCP_URL` entry; no personal key file was read.
- `penpair.config.json` names `Tradient`, the `packages/frontend-evolved` app, `tradientLight`/`tradientDark` from its `src/theme.ts`, and `design/marwes-tokens.snapshot.json`. It has neither a file pin nor baselines.
- The committed snapshot is schema 1 with the generated Core/Dark and Tradient Light/Dark sets. It declares no project extra set or ownership map.
- `packages/frontend-evolved/src/components/organisms/sidebar-nav.tsx` already exports `SidebarNav`. Reuse and assess that component before proposing another sidebar. A missing upstream-library primitive does not mean the consumer lacks one.
- The existing API workflow uses Node 20, pnpm 10.12.1 and a frozen lockfile install. Its legacy-frontend typecheck is a separate migration concern; this design-token proposal does not change that job's unrelated behavior.

The new commands in this improvement branch are unreleased. A `0.1.3` version string alone does not prove the installed tarball contains these changes. First use an owner-reviewed release or an isolated packed-branch trial; do not edit the consumer to depend on unreviewed branch behavior.

## Proposed small adoption change

- [ ] Owner authorizes a separate consumer branch and confirms the target checkout/worktree. Preserve `penpot-poc/` and every unrelated change.
- [ ] Add these entries to the existing root `scripts` object:

```json
{
  "design:doctor": "penpair doctor",
  "design:tokens:check": "penpair marwes tokens check"
}
```

- [ ] After the existing frozen install in the PR validation workflow, add this offline step:

```yaml
- name: Check design token snapshot
  run: pnpm run design:tokens:check
```

No Penpot key, browser or design-server connection belongs in this CI check. The initial adoption must regenerate the snapshot with the reviewed tool version before enabling a gate that would fail on the old expectation.

- [ ] Add only this empty documentation entry to `.env.example`, with a comment that each person creates their own key and stores it locally:

```dotenv
# Personal MCP endpoint; keep its value in ignored local configuration.
PENPAIR_MCP_URL=
```

- [ ] After installing the reviewed file-guard build, run `penpair connect --pin-file` while the owner independently confirms the intended open file. Commit the public file ID in `penpair.config.json`; keep personal keys out of the proposal, chat, diff and logs. Check `doctor --json` and exercise a wrong-file refusal on scratch files.
- [ ] Reconcile the installed skill path and project-facts reference with the chosen agent client. Use the owned instruction integration rather than replacing unrelated `AGENTS.md` text. Keep file identity in the typed config; facts may point to it.
- [ ] Declare the project-owned page/radius tokens under `marwes.extras` after reviewing their formulas or C1 measurements. Do not silently promote the field-note constants to authoritative component measurements.
- [ ] Regenerate the schema-2 token snapshot, review ownership and value changes, then run `design:tokens:check`. Inspect `tokens push` before any separately authorized Penpot mutation. Differing designer values require an explicit adopt/overwrite decision; prune is not a cleanup shortcut.

## Baseline and implementation follow-up

- [ ] Owner approves the intended `Dashboard / Desktop` frame and confirms its exact page, route and identity. No approval was inferred from the original brief.
- [ ] Add a baseline block only after that decision. The shape below is a merge template; replace the route with the application's actual route key:

```json
{
  "baselines": {
    "page": "Dashboard",
    "root": "design/baselines",
    "frames": [
      { "frame": "Dashboard / Desktop", "id": "dashboard-desktop", "route": "OWNER_CONFIRMED_ROUTE" }
    ]
  }
}
```

- [ ] Inspect `baselines`, explicitly authorize the first `--apply`, export/look twice, and commit only the reviewed reference generation. Add rich case metadata and required coverage once state/theme/fixture setup is specified. Rich cases remain pending implementation-provider mappings until those hooks exist.
- [ ] Establish one working implementation comparison through the existing baseline route before expanding the consumer handoff. Capture stable fonts/data and show desktop/mobile plus one non-happy state. Browser interaction and accessibility checks remain separate.
- [ ] Review the primary/border-brand/link/focus theme family with C4 lint and actual light/dark screenshots. Confirm supported theme-input fields before editing `src/theme.ts`; keep intentional blue accents when the owner chooses them. Regenerate/review the snapshot after any change.
- [ ] Compare the app's Marwes 1.11.0 appearance against an isolated 1.4.1 reference when an owner-approved old fixture is available. Do not downgrade or alter the current consumer just to obtain that comparison.
- [ ] Implement new UI only in `packages/frontend-evolved`, reusing its existing SidebarNav and library primitives. Follow its structure/styling/data patterns and preserve its product semantics. D1 supplies explicit behavior/component metadata; a visual frame alone cannot make this implementation mechanical.
- [ ] Migrate useful build bodies into reviewed files or registered operations. Split pure helpers, inspection, idempotent mutation and independent readback. Use `@kit` and explicit adapter recipes, stable owned identities and full source hashes; do not copy the throwaway runner's path or name-based deletion shortcuts.

## Validation for that future consumer branch

Run the new offline design check, the primary app's matching tests/typecheck/build, whitespace checks and a browser review for UI changes. Follow the consumer's own pre-push review instruction before a later authorized push or PR. No deployment, AWS write, publishing or external message is part of this handoff.

Owner decisions still needed: which reviewed Penpair build to adopt, the confirmed Penpot file, initial frame approval/route, project-extra constants, intentional theme accents and scope of Dashboard implementation. This proposal keeps those decisions reviewable without applying them.
