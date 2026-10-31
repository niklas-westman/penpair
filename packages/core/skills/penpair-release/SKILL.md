---
name: penpair-release
description: Plan, resume, verify and finalize a native Penpot product design release. Use for release pages, inherited frames, release readiness, adoption and approval blockers; publishing Penpair packages follows the repository release guide instead.
---

# Design release

## What this owns

Planning, assembling, verifying and finalizing a Penpot product design release.

Not here: Publishing Penpair's own npm packages — the repository's package release guide, which this skill does not authorize.

Use the pinned project's installed CLI. Start with `penpair --help` and
`penpair help design-release`; read the relevant subcommand help before an
unfamiliar action. Check capabilities rather than assuming this skill and CLI
have matching versions. Do not fetch a global replacement or invent flags.

## Locate the current step

1. Identify the requested product version and canonical release file. Inspect
   existing project records before creating a new draft. If multiple releases
   plausibly match the request, ask which one to work on.
2. Run `penpair design-release status --from RELEASE_FILE`. Read the entire
   command envelope, including completeness, blockers and next actions. Use
   `--live` when fresh Penpot evidence is needed; offline status cannot establish
   live freshness. If this CLI lacks `status`, use its documented `check` and
   `context` commands, state the limitation and do not infer a missing phase.
3. Report a short checkpoint at entry and after meaningful actions:

   ```text
   Release: <product version and canonical record>
   Step: <reported current step>
   Completed evidence: <verified prerequisites, with scope>
   Blocker: <reported blocker, or none>
   Next: <valid action; preview, read-only or approval-dependent>
   Design: <readiness and live freshness>
   Implementation: <comparison completeness and acceptance>
   ```

4. Follow the reported next valid action. Supply exact commands only when the
   required inputs are known; otherwise identify the missing input. Read only
   the reference relevant to the active step:

   | Current work | Read |
   | --- | --- |
   | Adoption or inherited membership | [Historical adoption](references/adoption.md) |
   | Assembly, retained frames, verification or review | [Native release workflow](references/workflow.md) |
   | Interrupted operation, stale evidence or unclear phase | [Status and recovery](references/status-and-recovery.md) |
   | Current-app comparison or implementation acceptance | [Comparison and handoff](references/comparison.md) |

5. Refresh status after actions. A saved lifecycle label, command acknowledgment,
   previous chat summary or checked Markdown box is not current readiness proof.
   A finalized release can remain finalized while later Penpot drift makes it
   invalid. Before finalization obtain a fresh live check and the owner's actual
   words for the exact candidate.

## Operating rules

- Penpot content the release writes (cover, overview, maps) is auto layout that
  sizes to its content; see `penpair-design/references/auto-layout.md`. Export
  with a long title and long text, and look at the image before reporting.
- A release page contains changed frames and an overview linking to retained
  frames on earlier pages. The complete frozen inventory, not just the new page,
  defines coverage. Stay inside the pinned Penpot file; never use name matching
  across pages to infer identity.
- Keep original reference bytes, identities and approval records immutable.
  Membership in an old release, equal-looking pixels or a successful browser
  comparison does not establish an earlier per-frame approval.
- Preserve separate gates for native fidelity, image approval, map review,
  release review and implementation acceptance. Design finalization does not
  assert that the application matches it.
- Start unfamiliar capture/transfer work with one representative board. Inspect
  its actual export before expanding. Unknown native fidelity remains blocking;
  never detach, flatten, redraw from screenshots or normalize sizing to pass.
- Keep stderr visible in the foreground or through `tee` with `pipefail`; never
  hide progress behind `tail -N` or buffered child output. Partial, cancelled and
  pending results remain incomplete regardless of passing returned cases.
- For every authorized Penpot write: read-only inspection, pinned snapshot, one
  idempotent write, independent readback and stable exports that are looked at.
  Keep snippets below 90 KB. Skill invocation grants no additional write scope
  and supplies no owner approval.
- A first export after a write/page switch may be stale; inspect stable exports
  twice. Cached ad-hoc exports and contact sheets assist review but do not prove
  fresh release/baseline fidelity.
- Before suggesting `wake --reload`, verify saving in the editor. A readable
  revision does not prove persistence; reload may discard unsaved changes.
- Store project release records and evidence in the project, never in installed
  skill folders. Product SemVer is separate from the Penpair package version.

Report **Changed**, **Validated**, **Risks**, retaining the current checkpoint.
A disconnected editor permits local preparation, not claims of live proof.
