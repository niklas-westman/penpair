# Native diagram review and recovery

## Readable bounded views

Use the contract as the semantic authority. Generated drawing plans become
incomplete if an axis exceeds 16,384 px or serialized plan data exceeds 64 KiB,
reserving room inside the 90 KB delivered snippet budget. Split large maps into
reviewable maps/detail views; do not clip a native drawing or shrink every label
until it is unreadable. Incomplete plans cannot be published as complete proof.

Keep neutral diagram presentation, readable labels, stable logical IDs and the
selected font. Do not alter project tokens to style diagrams. Missing fonts,
unsupported native fields and ownership conflicts remain failures.

## Semantic and presentation proposals

A label/title/edge-label or unambiguous endpoint change imports as a canonical
semantic proposal, with origins marked proposed. Keep its adjacent `.native.json`
observation: acceptance rechecks the exact contract, saved baseline and current
native observation before reconciling the contract/projection. A lost local
projection update after canonical acceptance needs safe reconciliation with that
same proposal, rather than a new native rewrite.

Geometry-only managed changes use `map-presentation-proposal`. Acceptance checks
the same canonical hash and saved baseline, requires the current native
fingerprint to match the observed one, exports again and writes the accepted
projection after evidence. Canonical intent stays unchanged. Fresh visual review
is required; old review must not silently cover changed native evidence.

New/unmanaged objects, ownership edits, style changes, ambiguous/deleted managed
objects and blocking findings do not become automatic intent. Inspect conflicts
and use a deliberate reviewed correction. Do not repeat an uncertain write or
paste without independent inspection.

Native proposal acceptance uses a live read-only observation to reject edits made
after import. After semantic acceptance, republish explicitly to update native
contract metadata, then review the new artifact. A purely local semantic proposal
without a native observation can be accepted offline. Preserve accepted node
positions/sizes when republishing.

## Explicit linked detail maps

Large maps are split deliberately, not automatically. Publish and review each
child contract independently. A parent's `kind: "detail-link"` node needs exactly
one `sourceId` pointing to a source with `kind: "contract"`, project-relative
`path`, raw file-byte `sha256` and exact `fileId`, `pageId`, `frameId` for its
published detail board in the same pinned file. The child has the same map kind,
and retains every parent requirement ID carried by the link; the link must cover
at least one requirement.

Generated Markdown supplies the contract link and native cards navigate to the
declared board using `NavigateTo`. Source freshness checks bind the referenced
contract bytes. Parent context exposes a child handoff, not an inlined child graph
or inherited child approval. Read the child context separately. Include all
parent/detail contracts and their independent reviews in the design release.
Do not claim a large incomplete map became complete by clipping content or
creating an unreviewed empty destination board.

## Resume an interrupted publication

After independently inspecting the actual target and retained run, use the same
map family's `publish --from FILE --page-id ID --apply --resume RUN_ID`, retaining
all original target flags. In particular, an originally omitted `--board-id`
stays omitted; retain a supplied `--board-id` or `--projection`. Resume requires
`--apply`, reuses the original journal and independently reconciles readback and
exports before deciding what remains. It never authorizes blind replay. Changed
canonical/source/drawing inputs or code signatures refuse reuse; inspect and
start a new explicit run instead of bypassing those guards.
