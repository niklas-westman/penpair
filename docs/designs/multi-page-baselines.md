# Baselines across release pages

## Status and recommendation

**Historical proposal, superseded by the native release implementation direction (2026-10-29).**
Examined Penpair 0.8.1, release commit `9e32620`. The original recommendation to
prioritize offline Projection composition was superseded by the owner's choice:
native Penpot release membership and live verification are required. See the
maintained [design-release guide](../design-releases.md) for the current workflow
and implementation/acceptance limits. Projection is a secondary reporting layer.

The design below records the earlier investigation; its schema examples and
optional-delivery sequence are not installation instructions for 0.8.1.

Prefer optional per-frame source pages within the same pinned file. Keep
`baselines.page` as the default, so existing single-page configurations keep
their meaning. Release pages may then contain only changed frames while the
active baseline set explicitly includes unchanged frames on earlier pages.

Ship this together with a reviewed approval-continuity contract shared by
coverage and Reflection. Page selection alone does not meet the request to keep
earlier approvals usable in comparison. Do not implement an unverified
`carriedFromRelease` label as an approval shortcut.

## User outcome

The current design set contains changed frames from the latest release page and
the unchanged Login/email cases from an earlier release page. A frame's source
page, approved reference and latest observation remain distinct. No full-product
copy is required for every release.

Capture, comparison, coverage and `approve --case` resolve the same effective
source. A retained earlier reference requires its own earlier owner approval;
membership in a previous release or a shared frame name is insufficient.

## Current constraints

- `baselines-config.ts`: `BaselinesConfig.page` is required and `BaselineFrame`
  has no page selector. Baseline IDs and explicit frame IDs are globally unique
  within a set; the set is bounded to 1,000 entries.
- `baselines.ts`: `exportBaselines` selects one page, captures frames, then
  rechecks that page before publishing a complete immutable generation. Schema-2
  manifests and `BaselinesReport` describe one page. Per-frame captured and
  approved provenance already retain file/page/frame IDs and revision.
- `cli-main.ts`: the `approve --case` branch checks the global baseline page,
  so changing capture selection alone would leave approval bound to the wrong
  selector.
- `approvals.ts`: `approvalFingerprint` binds the complete capture identity,
  image hash and case. `matchingApproval` also checks the stored approved image.
  Original approval records must remain immutable.
- `baseline-coverage.ts`: unchanged bytes/case/source may retain earlier approved
  provenance even when the current capture has a later file revision.
- `reflection-check/src/case-plan.ts`: `matchingCaseApproval` additionally requires
  equal approved/captured revisions. Consequently a case may count as approved
  design intent in coverage while remaining pending in Reflection after an
  unrelated edit advances the file revision.
- Current readers join configuration and saved results by baseline ID. A new
  multi-page contract must also bind the effective configured source to its
  observed identity, rather than allowing a changed selector to reuse stale data.

These differences need an explicit model, not removal of the revision check.

## Proposed selection model

Illustrative syntax; existing case metadata is omitted here for readability and
must be retained in a real migration:

```json
{
  "baselines": {
    "page": "release/1.0.1",
    "root": "design/baselines",
    "frames": [
      {
        "id": "login-empty",
        "page": "release/1.0.0",
        "frameId": "11111111-1111-4111-8111-111111111111",
        "route": "login"
      },
      {
        "id": "candidate-detail",
        "frameId": "22222222-2222-4222-8222-222222222222",
        "route": "candidate-detail"
      }
    ]
  }
}
```

- Effective source page is `frame.page ?? baselines.page`.
- Retain stable case IDs, routes, viewport/theme/state/fixture metadata and image
  formats. Changing the default page during migration must not silently retarget
  existing entries: first pin their intended source pages explicitly.
- Resolve exact page names to observed IDs; duplicate names fail. ID selection
  uses direct lookup on that page. Name-only selection stays top-level on that
  page, with no fallback to another page or release.
- Preserve existing uniqueness and count limits. Cross-file source selection is
  outside this first feature; the project file pin remains authoritative.
- A descriptive release label may be displayed, but never establishes identity,
  freshness or approval.

## Capture and publication

Group entries by effective page and process those groups sequentially inside a
page session. Do not parallelize editor page changes. Reuse direct frame-ID
selection and the existing stable-render protection after page switches.

Every initial page inventory, frame capture and final page recheck must agree on
the same pinned file and current file revision. Recheck every participating page
before publication. A missing target, ambiguous page, changed identity, unstable
render or revision change preserves the previously published baseline set.

Keep one baseline root and one coverage set. Write all new artifacts/cases into
an immutable generation before replacing its manifest. Do not publish a partial
set page by page. Progress identifies the case and effective page, as well as the
frame index/total.

## Approval continuity

Separate three facts:

1. **Reference:** an exact artifact approved earlier, including original capture
   revision, source IDs, bytes/hash, encoding, case and owner-words record/hash.
2. **Observation:** what was freshly captured now, with its own revision and time.
3. **Continuity:** independently checked evidence that this observation still
   matches the selected approved reference. This is not a new owner approval.

A continuity path may make an earlier approved image eligible for comparison
without pretending its approval was recorded at the new revision. It must verify
the original approval record and stored image; exact image-byte equality; the
same file/page/frame IDs; unchanged case intent; and matching capture identity
fields other than revision. Preserve unknown API/render/theme evidence as unknown.
Bind the selected baseline ID, route and effective source to the configuration
used for the set. Route is outside today's approval fingerprint, so migration
cannot infer its historical approval merely from an image hash.

Record the immutable prior-reference identity and new observation separately.
Continuity must be validated from the evidence, not accepted from a mutable
`same: true` or `carriedFrom` assertion. Never rewrite the earlier revision,
approval words, record hash or capture date. A copied board on another page is a
different identity, even when its pixels match.

Coverage and Reflection must use the same validated eligibility decision for
these retained references. Keep design intent, live source freshness and browser
verification separate. Any missing proof leaves the relevant case pending;
forced references and legacy evidence cannot become owner-approved through
migration. Existing initial-reference behavior is not evidence of earlier owner
words and must not be used to satisfy the retained-reference requirement.

The exact versioned continuity representation and public report typing are part
of the implementation design gate. Removing Reflection's revision check without
replacement evidence is explicitly excluded.

## Manifest and reader migration

Use a new manifest version for multi-page/continuity semantics, proposed schema 3.
Record participating pages and an effective resolved source per frame. A single
page/pageId must not pretend to describe a mixed-page set. Keep truthful report
typing and explicit single-page compatibility; test public consumer declarations.

Normalize schema-2 single-page records for reading without rewriting historical
provenance. Update all readers together: previous-reference/format resolution,
offline coverage, Reflection planning, generated comparison cases and MCP status.
Old readers must reject the new manifest version rather than silently misread it.

Consolidating the interim separate roots requires an explicit, validated import
of earlier references. Preserve originals. Pin a source manifest snapshot/hash,
baseline ID, image hash and original approval record. Validate paths and bytes
before committing a new set; missing historical configuration or approval remains
pending. Do not hand-concatenate manifests or rewrite approval provenance to make
relative paths fit a new root.

## Alternative: frozen artifact carry

Immutable carry is a different feature, useful when an old source page may be
removed or should not be recaptured. It needs explicit references to the frozen
manifest/generation, baseline ID, exact artifact and original owner approval.
It reports “earlier approved reference retained; live capture not run.”

It may support comparison against that historical reference, but cannot claim
fresh live source verification. A release name alone, missing current frame, or
equal-looking copied board must never trigger automatic carry. Defer this mode
until its eligibility rules are defined. The Reflection integration evaluation
identifies an existing upstream representation for this mode; prefer a validated
provider over inventing another generic carry format.

## Delivery sequence and acceptance

The sequence below concerns optional live multi-page capture. For the recommended
first delivery, use the historical-reference composition and bridge sequence in
the linked Reflection evaluation.

1. Specify source normalization, continuity proof, versioned manifest/report and
   schema-2 normalization. Cover the old-approved/new-observed revision scenario
   in both coverage and Reflection before choosing the wire format.
2. Implement grouped capture, direct per-page ID lookup and all-page rechecks.
3. Update `approve --case` and shared reader/eligibility validation together.
4. Add explicit reference import for the interim roots, retaining originals and
   existing IDs/cases/approvals. Do not promote legacy or unapproved entries.
5. Update help, skills, documentation, package smoke and a coordinated Changeset.

Acceptance includes unchanged single-page configuration and capture behavior; identical names on different
pages; missing/ambiguous pages; nested IDs; drift on either page preserving the
previous generation; earlier valid approval retained without new owner words;
changed pixels/source/case refusing continuity; cases without earlier owner approval remaining
pending; tampered records/hashes/paths rejected; case approval using the effective
page; and identical eligibility decisions in coverage and Reflection. Run adapter
tests, `pnpm format`, `pnpm check` and installed-package smoke tests.

Until this feature ships, separate release configurations and output folders are
a valid isolation strategy. Keep the earlier cases and approval artifacts intact.
Coverage remains per configuration; no aggregate current-product coverage exists
until an explicit composition step produces and validates it.
