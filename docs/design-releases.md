# Design releases

A design release freezes a reviewed design handoff for an explicit product SemVer,
independent of the Penpair package version. It joins
[journey maps](journey-maps.md), [integration maps](integration-maps.md), exact
design cases and immutable evidence so a later implementation agent can identify
what was reviewed. This is a design release, separate from publishing Penpair's
npm packages or accepting a frontend implementation.

## Find the current step

Use the project-installed `penpair-release` skill for product design
releases. Its entry point checks installed CLI capabilities, reads the canonical
release status and reports the current step, verified prerequisites, blockers and
next valid action. It is distinct from publishing Penpair npm packages.

```sh
pnpm exec penpair design-release status --from design/releases/1.0.1/release.json
pnpm exec penpair design-release status --from design/releases/1.0.1/release.json --live
```

Offline status validates saved evidence without claiming current Penpot freshness.
Live status additionally checks the actual pinned Penpot content. Read the full
command envelope: passing returned cases cannot compensate for pending cases or
an incomplete inventory. Status, checks and context use the same readiness
assessment. A recorded `final` state remains historical fact if later drift makes
the release currently invalid.

The skill reports design readiness/live freshness separately from implementation
comparison and acceptance. It does not infer progress from chat history or turn
technical verification into owner approval. When resuming, it inspects actual
journals and pinned inputs before recommending an action.

## Release pages contain changes

A release page contains new or changed product frames plus an overview and the
required native maps. The overview links to every active member, including
unchanged frames on earlier pages. Retained frames stay at their original
page/frame; a new product version does not require a full-product copy.

A version-2 plan inherits one exact finalized base and explicitly adds, replaces
or removes members. Planning freezes the complete resolved inventory, keeping
stable screen/case IDs and exact source, artifact and approval references.
The base includes both the finalized release record and its immutable bundle:

```json
{
  "base": {
    "release": { "path": "design/releases/1.0.0/release.json", "sha256": "EXACT_RECORD_HASH" },
    "bundle": { "path": "EXACT_BUNDLE_PATH", "sha256": "EXACT_BUNDLE_HASH" }
  },
  "changes": {
    "add": [],
    "replace": [],
    "remove": []
  }
}
```

This is a fragment, not a complete plan. The complete input has
`schemaVersion: 2`, `kind: "design-release-plan"`, identity/title/product version,
`fileId`, and the required reviewed `contracts`. Additions and replacements use
screen inputs with exact `inspection`, optional pinned `render`/`dependencies`,
and preserved `route`/`case` metadata. Set each screen's `comparisonThreshold` to the
reviewed allowed differing-pixel ratio; it defaults to `0.05`. When adopting an
existing configuration with another global or per-frame threshold, copy its
resolved value explicitly into the adoption screen. Do not let the default change
the old policy silently. Image approval is an exact
`approval` reference with `record`, `recordId` and `image`; each artifact reference
contains its project-relative `path` and `sha256`. Removals are `{ "id": "...",
"reason": "..." }`. An omitted base creates an initial complete release.

Replacements keep the stable requirement ID but need approval of the new target.
Removals must not leave unresolved coverage or map requirements. Conflicting
changes, unknown removals, stale/tampered base artifacts and cross-file sources
are rejected. Existing schema-1 release records remain readable; finalized
history is not rewritten into the new format.

Verification requires copy-fidelity receipts only for copied changed frames.
Retained frames require fresh live continuity evidence: unchanged source identity,
supported native structure, dependencies, case intent, capture environment and
approved image bytes. Their original approval records remain unchanged. A later
unrelated file revision is not itself a new approval or evidence of drift.
Missing or changed retained sources block finalization; there is no implicit
frozen-only fallback.

### Capture environment across revisions

The strict default needs an observed Penpot API version, browser identity and
theme identities to carry an approval across file revisions. Penpot MCP
sandboxes hide the browser, so that evidence is absent there and continuity
blocks. The opt-in profile `penpot-native-export-v1` (`--capture-policy
penpot-native-export-v1` on `approve` and `baselines`) is for that case. It
requires the observed API version, scale, theme identities and design
dimensions, and it records the browser as unknown (`renderEnvironment: null`);
it never relabels API or scale as browser identity. The profile is part of the
approval fingerprint, so it needs fresh owner approval. Approvals made without it
are never promoted. Retained members take the profile from their original
approval and still need unchanged source identity, native structure,
dependencies and exact approved bytes. Coverage keeps listing the renderer
environment as not observed.

The `proposedBaselines` context covers the full resolved inventory with stable
case IDs and effective per-frame pages. Baseline configuration may supply a
per-frame `page` or stable `pageId`; when both are present, the name is an
assertion for that ID, not a fallback. If neither is supplied, use
`baselines.page`. Per-frame `threshold` overrides `baselines.threshold`, then
falls back to `0.05`. The release context freezes the resolved policy in
`caseThresholds` and includes it in `proposedBaselines`. Capture is sequential by
page and publishes one complete generation only after all participating sources
are rechecked. A failed capture preserves the previous complete generation.
Coverage, case approval and comparison use the same eligibility decision.

## Adopt existing release pages

For existing pages and separate baseline roots, prepare a project-owned adoption
input from actual evidence, then create a draft:

```sh
pnpm exec penpair design-release adopt --from design/releases/adoption.json \
  --out design/releases/1.0.0/release.json
pnpm exec penpair design-release status --from design/releases/1.0.0/release.json
```

The input uses `schemaVersion: 2`, `kind: "design-release-adoption"`, release
identity/title/product version, pinned `fileId`, `screens` and reviewed
`contracts`. Screens use their existing page/frame IDs and original evidence.
Adoption does not copy product frames, mint approval or finalize the design.

Recover authentic owner approval records where available. A historical selected
reference label does not establish earlier owner approval. If the required proof
cannot be recovered, obtain fresh approval dated now and leave missing approval
visible until then. Never backdate approval or modify old artifacts to make an
import pass. Continue through normal assembly, live verification and review before
finalizing this first complete base.

## Copy boards to a release page

For an experimental same-file page transfer, preview the observed source boards:

```sh
penpair design-release copy --source-page "Screens" \
  --frame SOURCE_BOARD_ID --release 1.2.0
# After reviewing and authorizing the transfer:
penpair design-release copy --source-page "Screens" \
  --frame SOURCE_BOARD_ID --release 1.2.0 --debug-port 9222 --apply
```

This uses native editor copy/paste into `release/1.2.0`, preserving originals and
existing destination content, and writes private evidence under
`.penpair/native-copy/<run-id>/`. It can report incomplete native fidelity after
copying; read the findings and inspect the exports. The transfer receipt is not
a release manifest, the `verify --receipts` input schema or owner approval.
Copy-created page ownership does not by itself establish compatibility with the
full assembly flow below. See [native copy and recovery](copy-between-pages.md)
for prerequisites, clipboard effects, explicit resume and current proof limits.

## Local commands

Create the plan from actual source inspection, using your own product SemVer.
These paths illustrate project-owned inputs. A release accepts at most 100
selected source screens. Use the local project command, such as
`pnpm exec penpair`, when installed as a dependency.

```sh
# Save a planned release, then inspect the remote assembly preview.
penpair design-release plan --from design/releases/1.0.0/plan.json \
  --out design/releases/1.0.0/release.json
penpair design-release assemble --from design/releases/1.0.0/release.json

# After reviewing the preview and authorizing the assembly write:
penpair design-release assemble --from design/releases/1.0.0/release.json --apply
```

Next, perform the guided native copy and record actual source/target identities
in `receipts.json`. Preview and apply an assembly refresh using those receipts
before verification, so overview links target the frames actually pasted:

```sh
penpair design-release assemble --from design/releases/1.0.0/release.json \
  --receipts design/releases/1.0.0/receipts.json
penpair design-release assemble --from design/releases/1.0.0/release.json \
  --receipts design/releases/1.0.0/receipts.json --apply
```

For schema-2 changed targets, each receipt also carries the target's exact
`approval` references (`record`, `recordId`, `image`). Original source approval
does not approve a copy. Verification reads the live frames and saves evidence;
finalization below is a preview and records no owner approval.

```sh
penpair design-release verify --from design/releases/1.0.0/release.json \
  --receipts design/releases/1.0.0/receipts.json
penpair design-release finalize --from design/releases/1.0.0/release.json
penpair design-release check --from design/releases/1.0.0/release.json --live
penpair design-release context --from design/releases/1.0.0/release.json --draft
```

Only apply finalization after the owner supplies actual words for the exact
verified candidate, as described below. After finalization, omit `--draft` to
request approved context. Missing required proof keeps verification/finalization
incomplete; these commands do not bypass the native support limits.

## Prepare and assemble

Use the `design-release` command family to adopt or plan, inspect status, assemble,
verify, finalize, check and produce context. Use the installed command's help for current argument
names. Planning exposes required inputs and unresolved work. Assembly records
identities and hashes; it does not invent source observations or owner approval.
Each selected source needs its complete `inspection` reference (project-relative
`path` and exact `sha256`). Pin a stable source PNG through its `render` reference
before verification; a draft without this reference cannot pass fidelity. A
source using tokens also needs a complete pinned token-inspection `dependencies`
reference. Required dependency changes invalidate the pinned source evidence.

Include the parent and every linked detail-map contract in the release's
`contracts` list, each with its independent exact review. A reviewed parent link
is not approval of the child graph. See [linked detail maps](integration-maps.md#linked-detail-maps).

Keep the release page in the same pinned Penpot file, named `release/<version>`.
Assembly creates the owned overview/map sections and reports `awaiting-copy`.
Copy changed source design frames natively using a reviewed, guided copy/paste operation
by a person or an authorized AI using existing browser tools. The experimental
`design-release copy` path separately automates native clipboard transfer; its
receipt is not automatically a full release's mapping or approval. Assembly
does not perform an unsupported cross-page clone. The
[native copy guide](copy-between-pages.md) records both that API boundary and the
new transport's verification limits.
Preserve visual fidelity, native components, token bindings, text and layout;
do not recreate frames from screenshots or normalize their dimensions. A source
using auto height must retain it. Floating-point geometry noise is not a reason
to change source sizing.

The live sequence is read-only inspection, pinned snapshot, one idempotent write,
independent readback and stable exports that are looked at. Snippets stay under
90 KB. If a write response is uncertain, inspect what exists before retrying.
Keep unmanaged content intact; a page name alone cannot authorize replacement.
Do not copy via a lossy or structurally incomplete fallback when native fidelity
cannot be established: report the missing proof.

## Supported native verification limits

Native verification is deliberately narrower than native copy/paste. Selecting a
screen for this workflow does not establish that its content can be verified.
The current verifier blocks these cases:

- **All component instances, copies, main instances and component roots.** The
  inspection cannot establish complete override state. Retaining links during a
  copy is required, but it does not prove override fidelity.
- **Groups without an explicit `maskedGroup` observation.** An absent mask flag
  is unknown, not proof that the group is unmasked.
- **Unknown text range/style observations**, including unobserved mixed-range
  state, and any other unknown or missing required inspection field.
- **Paths/vector shapes whose actual path content was not observed.** A path
  type or matching raster export cannot establish the native path data.
- Unsupported shape content, incomplete hierarchy, unobservable interactions or
  missing pinned source render/dependency evidence.

A selected screen containing one of these cases remains blocked with a reason;
it cannot be finalized by waiving the finding or accepting equal pixels. Retain
its native structure and source evidence, then obtain the missing observation or
extend and validate inspection support before retrying. Do not detach components,
flatten groups, remove styles or substitute raster images to bypass the gate.
Simple screens whose required fields are fully observed can be assessed, but
that is not a claim of complete support for every native Penpot feature.

## Verify the package

Supply a project-owned receipt list with explicit `sourceId` and
`targetFrameId` values for copied frames to `verify --receipts FILE`. Retained
frames use their original target identities and independently checked continuity;
do not fabricate copy receipts for them. Check release frame identities
against the selected sources and retain immutable inspection/export evidence
with exact paths and hashes. Compare source and release frames independently,
including component/token identity and sizing
behavior, and inspect stable exports. A current rendering cannot rewrite the
bytes of an already recorded artifact. Native release objects remain mutable,
including changes inherited through shared components and tokens. A later change
is drift and needs a new reviewed generation, not a silent refresh of finalized
evidence.

New baseline evidence uses lossless WebP. Existing PNG baselines and image
approvals remain valid in their original format. Conversion must be a deliberate
migration with new evidence and review; never change approved bytes in place.
Penpot can supply PNG during export, so conversion must retain exact dimensions
and pixels. Quality 100 alone does not establish lossless encoding.

The release needs matching exact-artifact review records and no unresolved
blocking findings. Preserve the distinction between:

- Map review: the owner's supplied words bind an exact contract hash.
- Design image approval: the existing exact case/image approval protocol.
- Technical verification: independently observed structure and image evidence.
- Implementation acceptance: actual application behavior, browser evidence and
  owner review, assessed separately after implementation.

## Finalize and continue

The release record progresses from `planned` through `awaiting-copy` and
`verified` to `final`. Finalization records the reviewed release identity and
immutable evidence. It must not promote missing evidence, waivers or inferred owner approval into a
successful design gate. Finalized means the design package is ready to guide
implementation; it does not mean the application has been built or checked.

Finalization previews by default. Only use `finalize --apply --by OWNER --note
EXACT_WORDS` after the owner has supplied those words for the exact candidate.
Keep journal/run identity when reconciling interrupted remote work.

Run checks again before using the package later. Missing or modified artifacts,
changed map/source hashes and changed release evidence must remain visible as
drift or incomplete evidence. A saved-source check does not contact Penpot;
live freshness requires an explicit fresh observation. Context must identify
its verification scope and any truncation. Release context includes actual frozen
`mapContexts`, exact release-page `mapTargets`, independently pending implementation
status and next actions. Linked detail navigation targets the release's own child
boards; each child contract retains its separate review requirement.
Its `proposedBaselines` is a configuration fragment with WebP format, baseline
root, stable case IDs and explicit effective page/target `frameId` entries for
the full resolved inventory. Review and merge this fragment into the existing
`baselines` block; context does not rewrite project config or approve the new
target image identities.

A context generated from the canonical finalized record also contains
`releaseReference: { record: { path, sha256 }, bundle: { path, sha256 } }`. Both
native and custom-provider release comparisons independently reload these exact
artifacts; a saved ready/finalized label or matching case IDs alone is insufficient.
Regenerate older comparison contexts through the context command rather than
hand-adding reference fields. Library context callers must supply
`{ pointerPath: canonicalFinalRecord }` to produce this binding.


Refresh release status after each meaningful action. On interruption, keep the
original journal identity and inspect the actual target before retrying. An early
preparation run ID does not prove that a paste or resumable journal exists. Use
resume only when the CLI has matching pinned inputs and an actual journal; never
edit a finalized pointer or owner record to force the next step.

Assess a new release-bound comparison without modifying finalized evidence:

```sh
penpair design-release status --from design/releases/1.0.1/release.json \
  --comparison design/compare/run/report.json
```

`check` and `context` also accept `--comparison`. The exact release design hash,
case inventory, `caseThresholds` policy and artifacts must match. Browser success is measured comparison;
owner acceptance remains separately `not-recorded`. Do not overwrite frozen
implementation fields to attach a later report. In returned context,
`implementation` preserves the historical state frozen at design handoff;
`implementationAssessment` and `workflow.implementation` report the current
validated comparison, including missing, drift or passed evidence.

Use `penpair-handoff` with the approved integration context, then `penpair-verify`
for the actual frontend. Keep those later implementation results separately;
never rewrite the finalized design to match an implementation failure.

The [reset-password example](../examples/design-release-maps/README.md) is an
unapproved fixture showing decisions and gaps. It is not a finalized release or
proof of a live Penpot copy.
