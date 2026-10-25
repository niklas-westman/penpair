# Design releases

A design release freezes a reviewed design handoff for an explicit product SemVer,
independent of the Penpair package version. It joins
[journey maps](journey-maps.md), [integration maps](integration-maps.md), exact
design cases and immutable evidence so a later implementation agent can identify
what was reviewed. This is a design release, separate from publishing Penpair's
npm packages or accepting a frontend implementation.

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
in `receipts.json`. Verification reads the live frames and saves evidence;
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

Use the `design-release` command family to plan, assemble, verify, finalize,
check and produce context. Use the installed command's help for current argument
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
Copy source design frames natively using a reviewed, guided copy/paste operation
by a person or an authorized AI using existing browser tools. Assembly does not
perform an unsupported cross-page clone.
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
`targetFrameId` values to `verify --receipts FILE`. Check release frame identities
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
Its `proposedBaselines` is a configuration fragment with the release page, WebP
format, baseline root and explicit target `frameId` entries. Review and merge it
into the existing `baselines` block; context does not rewrite project config or
approve the new target image identities.

Use `penpair-handoff` with the approved integration context, then `penpair-verify`
for the actual frontend. Keep those later implementation results separately;
never rewrite the finalized design to match an implementation failure.

The [reset-password example](../examples/design-release-maps/README.md) is an
unapproved fixture showing decisions and gaps. It is not a finalized release or
proof of a live Penpot copy.
