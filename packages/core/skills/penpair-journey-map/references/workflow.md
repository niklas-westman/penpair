# Journey review workflow

## Evidence before agreement

Read the actual source and distinguish the visible state from inferred behavior.
For example, a confirmation frame does not prove that a request has succeeded;
record the transition as proposed until actual project evidence or an owner
decision supplies it. Retain source paths/hashes and exact frame identity.

Use stable requirement IDs through the journey and integration map. Every
requirement must be mapped through a node or edge's `requirementIds`; a sentence
that never appears in the graph is a coverage gap. An integration map must retain
all linked journey requirement IDs. Draft checks/rendering remain useful, but
readiness and release finalization must expose missing coverage.

## Three review gates

1. Intent is explicit: meaningful success/recovery paths, evidence and unknowns
   are recorded; open blocking findings remain visible.
2. The exact contract and derived views have been reviewed; record only actual
   owner words, independently of image approval.
3. The next agent receives current bounded context and the exact integration
   link; changed sources or contract hashes require renewed validation.

A semantic native edit imports as a base-hash-bound proposal. Keep the canonical
proposal and its adjacent `.native.json` observation together when supplied.
Accepting the proposal changes intent and requires fresh approval. Pure geometry
uses a separate presentation proposal: it retains canonical intent, records a
fresh native observation/export and requires visual review again.

Native proposal acceptance uses a live read-only observation to reject edits made
after import. After semantic acceptance, republish explicitly to update native
contract metadata, then review the new artifact. A purely local semantic proposal
without a native observation can be accepted offline. Preserve accepted node
positions/sizes when republishing.
